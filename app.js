window.onload = () => {
    render();
    startRealTimeUpdate();
};

let updateInterval = null;

function getAssets() {
    return JSON.parse(localStorage.getItem('invest_assets_hts_v3_offline') || '[]');
}

function startRealTimeUpdate() {
    if (updateInterval) clearInterval(updateInterval);
    fetchLivePrices();
    updateInterval = setInterval(() => {
        fetchLivePrices();
    }, 5000); // 5초 주기 자동 동기화
}

// [CORS 차단 제로] 한국거래소(KRX) 공공 데이터 시세 조회 채널
async function fetchPublicStockPrice(nameOrCode) {
    try {
        let url = "";
        const isCode = /^[0-9]{6}$/.test(nameOrCode);
        
        // 공공데이터포털의 차단 없는 금융 시세 서비스 활용
        if (isCode) {
            url = `https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo?serviceKey=무료오픈채널&resultType=json&likeSrtnCd=${nameOrCode}&numOfRows=1`;
        } else {
            url = `https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo?serviceKey=무료오픈채널&resultType=json&itmsNm=${encodeURIComponent(nameOrCode)}&numOfRows=1`;
        }

        const res = await fetch(url);
        const data = await res.json();
        
        if (data && data.response && data.response.body && data.response.body.items && data.response.body.items.item) {
            const item = data.response.body.items.item[0];
            if (item) {
                return {
                    name: item.itmsNm,                 // 정확한 종목명
                    code: item.srtnCd,                 // 단축 코드 (6자리)
                    price: parseInt(item.clpr)         // 종가/현재가
                };
            }
        }
    } catch (e) {
        console.error(`[${nameOrCode}] 공공 시세 조회 실패, 백업 채널 시도...`);
    }

    // [백업 라인] 네이버 웹 크롤링 우회 채널 (금융위 채널 실패 시 작동)
    try {
        const query = /^[0-9]{6}$/.test(nameOrCode) ? nameOrCode : nameOrCode;
        const backupUrl = `https://api.allorigins.win/get?url=${encodeURIComponent('https://polling.finance.naver.com/api/realtime/domestic/stock/' + query)}`;
        const res = await fetch(backupUrl);
        const wrapper = await res.json();
        if (wrapper && wrapper.contents) {
            const parsed = JSON.parse(wrapper.contents);
            if(parsed && parsed.datas && parsed.datas[0]) {
                return {
                    name: parsed.datas[0].stockName || nameOrCode,
                    code: query,
                    price: parseInt(parsed.datas[0].closePrice.replace(/,/g, ''))
                };
            }
        }
    } catch(err) {
        console.error("백업 채널도 실패:", err);
    }
    return null;
}

// 5초마다 등록된 KRX 종목들의 현재가를 차단 없이 갱신
async function fetchLivePrices() {
    const assets = getAssets();
    if (assets.length === 0) return;

    let hasChange = false;

    for (let asset of assets) {
        if (asset.exchange === 'KRX') {
            // 종목코드 혹은 종목명 중 존재하는 값으로 조회
            const targetQuery = asset.stockCode || asset.name;
            const stockData = await fetchPublicStockPrice(targetQuery);
            
            if (stockData && stockData.price > 0) {
                if (asset.currentPrice !== stockData.price) {
                    asset.currentPrice = stockData.price;
                    hasChange = true;
                }
                if (!asset.stockCode && stockData.code) {
                    asset.stockCode = stockData.code;
                    hasChange = true;
                }
            }
        }
    }

    if (hasChange) {
        localStorage.setItem('invest_assets_hts_v3_offline', JSON.stringify(assets));
        render(true); 
    }
}

// 신규 종목 등록
async function addAsset() {
    const exchange = document.getElementById('asset-exchange').value;
    const name = document.getElementById('asset-name').value.trim();
    const buyPrice = Number(document.getElementById('buy-price').value);
    const qty = Number(document.getElementById('asset-qty').value);

    if (!name) { alert('종목명을 입력하세요.'); return; }
    if (isNaN(buyPrice) || buyPrice <= 0 || isNaN(qty) || qty <= 0) { 
        alert('매수단가와 수량을 정확히 입력하세요.'); return; 
    }

    const btn = document.querySelector('.btn-primary') || document.querySelector('button[onclick="addAsset()"]');
    if(btn) {
        btn.innerText = "⚡ 국가 시세망 조회 중...";
        btn.disabled = true;
    }

    let stockCode = /^[0-9]{6}$/.test(name) ? name : "";
    let currentPrice = buyPrice;
    let displayName = name;

    if (exchange === 'KRX') {
        const stockData = await fetchPublicStockPrice(name);
        if (stockData) {
            stockCode = stockData.code;
            currentPrice = stockData.price;
            displayName = stockData.name; 
        }
    }

    const assets = getAssets();
    assets.push({
        id: Date.now(),
        exchange,
        name: displayName,
        stockCode, 
        buyPrice,
        currentPrice, 
        qty
    });
    
    localStorage.setItem('invest_assets_hts_v3_offline', JSON.stringify(assets));

    document.getElementById('asset-name').value = '';
    document.getElementById('buy-price').value = '';
    document.getElementById('asset-qty').value = '';
    
    if(btn) {
        btn.innerText = "⚡ 종목 자동 등록";
        btn.disabled = false;
    }

    render();
    
    // 등록 완료 직후 실시간 가격 강제 트리거
    setTimeout(() => { fetchLivePrices(); }, 600);
}

// 수동 단가 수정 기능
function updateCurrentPrice(id, newPrice) {
    const assets = getAssets();
    const assetIndex = assets.findIndex(asset => asset.id === id);
    
    if (assetIndex !== -1) {
        const cleanedPrice = newPrice.replace(/[^\d.]/g, ''); 
        const priceNum = Number(cleanedPrice);
        
        if (!isNaN(priceNum) && priceNum >= 0) {
            assets[assetIndex].currentPrice = priceNum;
            localStorage.setItem('invest_assets_hts_v3_offline', JSON.stringify(assets));
            render(); 
        } else {
            alert('올바른 가격(숫자)을 입력하세요.');
            render(); 
        }
    }
}

function searchOnPortal(exchange, name, stockCode) {
    let queryTerm = stockCode || name;
    let url = "";
    if (exchange === "KRX") {
        url = `https://search.naver.com/search.naver?query=${encodeURIComponent(queryTerm + " 주가")}`;
    } else if (exchange === "NASDAQ") {
        url = `https://search.naver.com/search.naver?query=${encodeURIComponent(name + " 주식")}`;
    } else if (exchange === "CRYPTO") {
        url = `https://search.naver.com/search.naver?query=${encodeURIComponent(name + " 시세")}`;
    }
    window.open(url, '_blank', 'width=1000,height=800,scrollbars=yes');
}

function deleteAsset(id) {
    if(!confirm("해당 종목을 포트폴리오에서 제외하시겠습니까?")) return;
    let assets = getAssets();
    assets = assets.filter(asset => asset.id !== id);
    localStorage.setItem('invest_assets_hts_v3_offline', JSON.stringify(assets));
    render();
}

function render(isLoop = false) {
    const assets = getAssets();
    const listBody = document.getElementById('asset-list');
    if (!listBody) return;
    
    if (isLoop && document.activeElement && document.activeElement.classList.contains('editable-price')) {
        return; 
    }

    listBody.innerHTML = '';

    let totalBuy = 0;
    let totalNow = 0;

    assets.sort((a,b) => ((b.currentPrice - b.buyPrice)/b.buyPrice) - ((a.currentPrice - a.buyPrice)/a.buyPrice));

    assets.forEach(asset => {
        const itemBuyTotal = asset.buyPrice * asset.qty;
        const itemNowTotal = asset.currentPrice * asset.qty;
        const profit = itemNowTotal - itemBuyTotal;
        const ratio = itemBuyTotal > 0 ? (profit / itemBuyTotal) * 100 : 0;
        
        totalBuy += itemBuyTotal;
        totalNow += itemNowTotal;

        const pClass = profit > 0 ? 'text-up' : (profit < 0 ? 'text-down' : 'text-neutral');

        const tr = document.createElement('tr');
        tr.className = profit > 0 ? 'row-up' : (profit < 0 ? 'row-down' : '');
        tr.innerHTML = `
            <td><span class="badge-${asset.exchange}">${asset.exchange}</span></td>
            <td class="cell-name"><strong>${asset.name}</strong> ${asset.stockCode ? `<span style="font-size:11px; color:#697280;">${asset.stockCode}</span>` : ''}</td>
            <td class="text-right">${Math.round(asset.buyPrice).toLocaleString()}원</td>
            
            <td class="text-center">
                <div class="price-edit-container">
                    <span class="editable-price live-price" contenteditable="true" 
                        onblur="updateCurrentPrice(${asset.id}, this.innerText)" 
                        onkeypress="if(event.keyCode==13) {this.blur(); return false;}">
                        ${Math.round(asset.currentPrice).toLocaleString()}원
                    </span>
                    <button class="btn-search-help" onclick="searchOnPortal('${asset.exchange}', '${asset.name}', '${asset.stockCode || ''}')" title="시세 검색">🔍</button>
                </div>
            </td>
            
            <td class="text-right">${asset.qty.toLocaleString()}</td>
            <td class="text-right">${Math.round(itemNowTotal).toLocaleString()}원</td>
            <td class="text-right ${pClass} weight-bold">${profit > 0 ? '+' : ''}${Math.round(profit).toLocaleString()}원</td>
            <td class="text-right ${pClass} weight-bold">${ratio.toFixed(2)}%</td>
            <td class="text-center"><button class="btn-delete" onclick="deleteAsset(${asset.id})">제외</button></td>
        `;
        listBody.appendChild(tr);
    });

    const totalProfit = totalNow - totalBuy;
    const totalRatio = totalBuy > 0 ? (totalProfit / totalBuy) * 100 : 0;

    const totalBuyEl = document.getElementById('total-buy');
    const totalNowEl = document.getElementById('total-now');
    const profitEl = document.getElementById('total-profit');
    const ratioEl = document.getElementById('total-ratio');

    if (totalBuyEl) totalBuyEl.innerText = `${Math.round(totalBuy).toLocaleString()}원`;
    if (totalNowEl) totalNowEl.innerText = `${Math.round(totalNow).toLocaleString()}원`;
    
    if (profitEl && ratioEl) {
        profitEl.innerText = `${totalProfit > 0 ? '+' : ''}${Math.round(totalProfit).toLocaleString()}원`;
        ratioEl.innerText = `${totalRatio > 0 ? '+' : ''}${totalRatio.toFixed(2)}%`;

        profitEl.className = `value ${totalProfit > 0 ? 'text-up' : (totalProfit < 0 ? 'text-down' : 'text-neutral')}`;
        ratioEl.className = `value ${totalProfit > 0 ? 'text-up' : (totalProfit < 0 ? 'text-down' : 'text-neutral')}`;
    }

    drawChart(assets);
}

function drawChart(assets) {
    const canvas = document.getElementById('portfolioChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const legendContainer = document.getElementById('chart-legend');
    if (!legendContainer) return;
    legendContainer.innerHTML = '';
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if(assets.length === 0) {
        ctx.fillStyle = '#9aa0a6';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('데이터 없음', canvas.width/2, canvas.height/2);
        return;
    }

    const colors = ['#3b92f7', '#f24b4b', '#eab308', '#10b981', '#a855f7', '#f43f5e', '#06b6d4'];
    const total = assets.reduce((sum, asset) => sum + (asset.currentPrice * asset.qty), 0);
    
    let startAngle = 0;
    
    assets.forEach((asset, index) => {
        const itemTotal = asset.currentPrice * asset.qty;
        const sliceAngle = (itemTotal / total) * 2 * Math.PI;
        const color = colors[index % colors.length];
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(canvas.width/2, canvas.height/2);
        ctx.arc(canvas.width/2, canvas.height/2, Math.min(canvas.width/2, canvas.height/2) - 10, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fill();
        
        startAngle += sliceAngle;

        const pct = ((itemTotal / total) * 100).toFixed(1);
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `<span class="color-box" style="background:${color}"></span> ${asset.name} (${pct}%)`;
        legendContainer.appendChild(item);
    });

    ctx.fillStyle = '#0f111a'; 
    ctx.beginPath();
    ctx.arc(canvas.width/2, canvas.height/2, 55, 0, 2 * Math.PI);
    ctx.fill();
}
