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
    }, 5000);
}

// CORS 차단을 방어하기 위해 프록시 주소를 결합하여 종목코드를 검색합니다.
async function getStockCodeByName(name) {
    try {
        const targetUrl = `https://ac.finance.naver.com/ac?q=${encodeURIComponent(name)}&q_enc=euc-kr&st=111&r_format=json&r_enc=euc-kr&r_unicode=1&t_koreng=1&r_lt=111`;
        // 브라우저 직접 요청 시 차단되는 현상을 막기 위해 공개 프록시를 경유합니다.
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
        
        const res = await fetch(proxyUrl);
        const json = await res.json();
        const data = JSON.parse(json.contents);
        
        if (data && data.items && data.items[0] && data.items[0][0]) {
            return data.items[0][0][0]; 
        }
    } catch (e) {
        console.warn("네이버 검색 통신 차단 또는 실패 (수동 연동 모드로 전환):", e);
    }
    return null;
}

// 실시간 가격 조회 함수 (에러가 나도 먹통이 되지 않도록 안전장치 강화)
async function fetchLivePrices() {
    const assets = getAssets();
    if (assets.length === 0) return;

    let hasChange = false;

    const promises = assets.map(async (asset) => {
        if (asset.exchange === 'KRX') {
            try {
                if (!asset.stockCode) {
                    const code = await getStockCodeByName(asset.name);
                    if (code) { asset.stockCode = code; hasChange = true; }
                }

                if (asset.stockCode) {
                    const targetPriceUrl = `https://polling.finance.naver.com/api/realtime/domestic/stock/${asset.stockCode}`;
                    const proxyPriceUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetPriceUrl)}`;
                    
                    const priceRes = await fetch(proxyPriceUrl);
                    const priceJson = await priceRes.json();
                    const priceData = JSON.parse(priceJson.contents);
                    
                    if (priceData && priceData.datas && priceData.datas[0]) {
                        const livePrice = parseInt(priceData.datas[0].closePrice.replace(/,/g, ''));
                        if (asset.currentPrice !== livePrice) {
                            asset.currentPrice = livePrice;
                            hasChange = true;
                        }
                    }
                }
            } catch (e) {
                console.error(`${asset.name} 가격 업데이트 실패:`, e);
            }
        }
        return asset;
    });

    const updatedAssets = await Promise.all(promises);
    
    // 무한 루프 렌더링을 방지하기 위해 가격 변동이 있을 때만 로컬스토리지 저장 및 렌더링
    if (hasChange) {
        localStorage.setItem('invest_assets_hts_v3_offline', JSON.stringify(updatedAssets));
        render(true); 
    }
}

// 종목 추가 함수 (코드를 못 찾아도 무조건 리스트에 '넘어가도록' 수정)
async function addAsset() {
    const exchange = document.getElementById('asset-exchange').value;
    const name = document.getElementById('asset-name').value.trim();
    const buyPrice = Number(document.getElementById('buy-price').value);
    const qty = Number(document.getElementById('asset-qty').value);

    if (!name) { alert('종목명을 입력하세요.'); return; }
    if (isNaN(buyPrice) || buyPrice <= 0 || isNaN(qty) || qty <= 0) { 
        alert('매수단가와 수량을 정확히 입력하세요.'); return; 
    }

    // 로딩 표시 대용 (버튼 비활성화)
    const btn = document.querySelector('.btn-primary');
    btn.innerText = "조회 및 등록 중...";
    btn.disabled = true;

    let stockCode = null;
    if (exchange === 'KRX') {
        stockCode = await getStockCodeByName(name);
        // [핵심 보완] 검색 에러가 나거나 코드를 못 찾아도 alert창으로 막지 않고 일단 진행시킵니다.
    }

    const assets = getAssets();
    assets.push({
        id: Date.now(),
        exchange,
        name,
        stockCode, 
        buyPrice,
        currentPrice: buyPrice, // 초기값은 매수단가
        qty
    });
    
    localStorage.setItem('invest_assets_hts_v3_offline', JSON.stringify(assets));

    // 입력창 비우기 및 버튼 원상복구
    document.getElementById('asset-name').value = '';
    document.getElementById('buy-price').value = '';
    document.getElementById('asset-qty').value = '';
    btn.innerText = "⚡ 종목 자동 등록";
    btn.disabled = false;

    render();
    
    // 등록 즉시 실시간 가격 스캔 작동
    if (stockCode) {
        fetchLivePrices();
    }
}

// 현재단가 수동 변경 적용
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
                    <button class="btn-search-help" onclick="searchOnPortal('${asset.exchange}', '${asset.name}', '${asset.stockCode || ''}')" title="네이버에서 시세 검색">🔍</button>
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

    const colors = ['#f24b4b', '#3b92f7', '#eab308', '#10b981', '#a855f7', '#f43f5e', '#06b6d4'];
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
