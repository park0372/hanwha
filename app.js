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
    }, 5000); // 5초 주기 자동 갱신
}

// 명칭 또는 코드로 데이터를 가져오는 터널
async function fetchPriceAndCodeByName(nameOrCode) {
    const isCode = /^[0-9]{6}$/.test(nameOrCode);
    if (isCode) {
        try {
            const directUrl = `https://polling.finance.naver.com/api/realtime/domestic/stock/${nameOrCode}`;
            const res = await fetch(directUrl);
            const data = await res.json();
            if (data && data.datas && data.datas[0]) {
                return {
                    code: nameOrCode,
                    price: parseInt(data.datas[0].closePrice.replace(/,/g, ''))
                };
            }
        } catch(e) {
            console.log("직통 코드 조회 실패");
        }
    }

    try {
        const targetUrl = `https://finance.naver.com/api/sise/searchItemList.naver?keyword=${encodeURIComponent(nameOrCode)}`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;

        const res = await fetch(proxyUrl);
        const wrapper = await res.json();
        
        if (wrapper && wrapper.contents) {
            const data = JSON.parse(wrapper.contents);
            if (data && data.length > 0) {
                return {
                    code: data[0].code,
                    price: parseInt(String(data[0].nowPrice))
                };
            }
        }
    } catch (e) {
        console.error(`[${nameOrCode}] 시세 조회 실패:`, e);
    }
    return null;
}

// 실시간 가격 주기적 동기화
async function fetchLivePrices() {
    const assets = getAssets();
    if (assets.length === 0) return;

    let hasChange = false;

    for (let asset of assets) {
        if (asset.exchange === 'KRX' && asset.stockCode) {
            try {
                const directUrl = `https://polling.finance.naver.com/api/realtime/domestic/stock/${asset.stockCode}`;
                const res = await fetch(directUrl);
                const data = await res.json();
                
                if (data && data.datas && data.datas[0]) {
                    const realPrice = parseInt(data.datas[0].closePrice.replace(/,/g, ''));
                    if (realPrice > 0 && asset.currentPrice !== realPrice) {
                        asset.currentPrice = realPrice;
                        hasChange = true;
                    }
                }
            } catch (e) {
                const stockData = await fetchPriceAndCodeByName(asset.name);
                if (stockData && stockData.price > 0 && asset.currentPrice !== stockData.price) {
                    asset.currentPrice = stockData.price;
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

// 신규 종목 등록 (에러 없도록 안전망 강화)
async function addAsset() {
    const exchange = document.getElementById('asset-exchange').value;
    const name = document.getElementById('asset-name').value.trim();
    const buyPrice = Number(document.getElementById('buy-price').value);
    const qty = Number(document.getElementById('asset-qty').value);

    if (!name) { alert('종목명 또는 종목코드를 입력하세요.'); return; }
    if (isNaN(buyPrice) || buyPrice <= 0 || isNaN(qty) || qty <= 0) { 
        alert('매수단가와 수량을 정확히 입력하세요.'); return; 
    }

    // 오타가 있던 버그 수정 코드 (가장 안전한 태그 선택으로 변경)
    const btn = document.querySelector('.btn-primary') || document.querySelector('button[onclick="addAsset()"]');
    if(btn) {
        btn.innerText = "⚡ 등록 처리 중...";
        btn.disabled = true;
    }

    let stockCode = /^[0-9]{6}$/.test(name) ? name : "";
    let currentPrice = buyPrice;

    // 비동기 조회가 실패하거나 딜레이가 생겨도 무조건 등록 루프를 타게 설계
    if (exchange === 'KRX') {
        try {
            const stockData = await fetchPriceAndCodeByName(name);
            if (stockData) {
                stockCode = stockData.code;
                currentPrice = stockData.price;
            }
        } catch (e) {
            console.log("시세 조회 중 오류 발생 - 기본값으로 등록 진행");
        }
    }

    const assets = getAssets();
    assets.push({
        id: Date.now(),
        exchange,
        name,
        stockCode, 
        buyPrice,
        currentPrice, 
        qty
    });
    
    localStorage.setItem('invest_assets_hts_v3_offline', JSON.stringify(assets));

    // 입력창 초기화
    document.getElementById('asset-name').value = '';
    document.getElementById('buy-price').value = '';
    document.getElementById('asset-qty').value = '';
    
    if(btn) {
        btn.innerText = "⚡ 종목 자동 등록";
        btn.disabled = false;
    }

    render();
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
