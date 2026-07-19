종목코드 대신 '삼성전자', '우리금융지주'처럼 이름만 입력해도 자동으로 실시간 가격을 가져올 수 있도록 코드를 한 단계 업그레이드하겠습니다.

네이버 증권의 내부 검색 API를 한 번 더 거쳐서 [이름 검색 ➔ 종목코드 추출 ➔ 실시간 가격 조회] 순서로 알아서 처리되도록 app.js를 수정하는 방식입니다.

1. app.js (전체 교체)
기존 app.js 내용을 전부 지우고 아래 코드로 덮어씌워 주세요. 이제 국내주식(KRX)은 이름만 넣어도 동작합니다.

JavaScript
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

// [핵심 변경] 종목명만으로 네이버에서 종목코드를 찾아오는 함수
async function getStockCodeByName(name) {
    try {
        // 네이버 증권 자동완성/검색 API 활용
        const searchUrl = `https://ac.finance.naver.com/ac?q=${encodeURIComponent(name)}&q_enc=euc-kr&st=111&r_format=json&r_enc=euc-kr&r_unicode=1&t_koreng=1&r_lt=111`;
        const res = await fetch(searchUrl);
        const data = await res.json();
        
        // 검색 결과 중 가장 첫 번째 종목의 코드를 반환
        if (data && data.items && data.items[0] && data.items[0][0]) {
            return data.items[0][0][0]; // 6자리 종목코드 추출
        }
    } catch (e) {
        console.error("종목코드 검색 실패:", e);
    }
    return null;
}

// 실시간 가격 긁어오기
async function fetchLivePrices() {
    const assets = getAssets();
    if (assets.length === 0) return;

    const promises = assets.map(async (asset) => {
        if (asset.exchange === 'KRX') {
            try {
                // 1. 만약 저장된 종목코드가 없다면 이름으로 먼저 찾기
                if (!asset.stockCode) {
                    const code = await getStockCodeByName(asset.name);
                    if (code) asset.stockCode = code;
                }

                // 2. 종목코드가 확보되었다면 실시간 가격 조회
                if (asset.stockCode) {
                    const priceRes = await fetch(`https://polling.finance.naver.com/api/realtime/domestic/stock/${asset.stockCode}`);
                    const priceData = await priceRes.json();
                    if (priceData && priceData.datas && priceData.datas[0]) {
                        const livePrice = parseInt(priceData.datas[0].closePrice.replace(/,/g, ''));
                        asset.currentPrice = livePrice;
                    }
                }
            } catch (e) {
                console.error(`${asset.name} 가격 갱신 실패:`, e);
            }
        }
        return asset;
    });

    const updatedAssets = await Promise.all(promises);
    localStorage.setItem('invest_assets_hts_v3_offline', JSON.stringify(updatedAssets));
    render(true); 
}

// 종목 추가 (이제 이름만 받아옵니다)
async function addAsset() {
    const exchange = document.getElementById('asset-exchange').value;
    const name = document.getElementById('asset-name').value.trim();
    const buyPrice = Number(document.getElementById('buy-price').value);
    const qty = Number(document.getElementById('asset-qty').value);

    if (!name) { alert('종목명을 입력하세요.'); return; }
    if (isNaN(buyPrice) || buyPrice <= 0 || isNaN(qty) || qty <= 0) { 
        alert('매수단가와 수량을 정확히 입력하세요.'); return; 
    }

    // 국내주식인 경우 등록할 때 백그라운드에서 코드를 미리 한 번 조회해봅니다.
    let stockCode = null;
    if (exchange === 'KRX') {
        stockCode = await getStockCodeByName(name);
        if (!stockCode) {
            alert('네이버 증권에서 종목을 찾을 수 없습니다. 정확한 종목명을 입력해주세요.');
            return;
        }
    }

    const assets = getAssets();
    assets.push({
        id: Date.now(),
        exchange,
        name,
        stockCode, 
        buyPrice,
        currentPrice: buyPrice, 
        qty
    });
    
    localStorage.setItem('invest_assets_hts_v3_offline', JSON.stringify(assets));

    document.getElementById('asset-name').value = '';
    document.getElementById('buy-price').value = '';
    document.getElementById('asset-qty').value = '';

    render();
    fetchLivePrices();
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
