/* ==========================================
   Sakura Casino – app.js
   Responsive Game Clients, Auth & Synced Account Payouts
   ========================================== */

// ──── BACKEND URL CONFIGURATION ────
// Setze hier die URL deines Bot-Servers ein (z.B. VPS IP, Render, Railway).
// Beispiele:
//   'https://dein-bot.onrender.com'
//   'http://123.45.67.89:9813'
//   'https://mein-bot.railway.app'
const BOT_SERVER_URL = 'http://93.115.101.183:9813';

const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:9813'
    : BOT_SERVER_URL;

// Game state
let user = null;
let userBalance = 0;
let dailyCasesCount = 0;
let activeTab = 'slots';
let currentRouletteBet = null;
let activeBjGame = null;

// Audio context or simple audio generation for premium sound feel
const playSound = (type) => {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (type === 'coin') {
            osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
            osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1); // A5
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.35);
        } else if (type === 'spin') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, audioCtx.currentTime);
            osc.frequency.linearRampToValueAtTime(350, audioCtx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.15);
        } else if (type === 'deal') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(300, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.15);
        } else if (type === 'win') {
            osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
            osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
            osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.2); // G5
            osc.frequency.setValueAtTime(1046.50, audioCtx.currentTime + 0.3); // C6
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.6);
        } else if (type === 'lose') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, audioCtx.currentTime); // A3
            osc.frequency.linearRampToValueAtTime(110, audioCtx.currentTime + 0.4); // A2
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.4);
        }
    } catch (_) {
        // Suppress browser block on audio context before user interaction
    }
};

// Custom toast notification system
const showToast = (message, type = 'success') => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-circle-xmark';
    if (type === 'info') iconClass = 'fa-circle-info';
    
    toast.innerHTML = `
        <i class="fa-solid ${iconClass} toast-icon"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 50);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
};

// Animate floating gold coins on winning
const triggerCoinExplosion = () => {
    playSound('win');
    for (let i = 0; i < 20; i++) {
        const coin = document.createElement('div');
        coin.className = 'coin-effect';
        coin.innerHTML = '<i class="fa-solid fa-coins"></i>';
        
        // Random explosion vectors
        const tx = (Math.random() - 0.5) * 500;
        const ty = (Math.random() - 0.7) * 400 - 100;
        const rot = Math.random() * 720;
        
        coin.style.setProperty('--tx', `${tx}px`);
        coin.style.setProperty('--ty', `${ty}px`);
        coin.style.setProperty('--rot', `${rot}deg`);
        
        // Explode from mouse click coordinate or screen center
        coin.style.left = `${window.innerWidth / 2}px`;
        coin.style.top = `${window.innerHeight / 2}px`;
        
        document.body.appendChild(coin);
        setTimeout(() => coin.remove(), 800);
    }
};

// Get Request Headers with JWT Token
const getHeaders = () => {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
};

// Check Auth & Fetch user data
const checkAuth = async () => {
    // 1. Check for token in URL (redirected from discord login callback)
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
        localStorage.setItem('token', token);
        // Clean URL to keep it pretty
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    const localToken = localStorage.getItem('token');
    if (!localToken) {
        showLoginScreen();
        return;
    }
    
    try {
        // Fetch current user details
        const resMe = await fetch(`${BACKEND_URL}/api/users/me`, { headers: getHeaders() });
        if (!resMe.ok) throw new Error('Token expired');
        
        user = await resMe.json();
        
        // Populate profile DOM
        document.getElementById('user-avatar').src = user.avatar 
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` 
            : 'https://i.postimg.cc/1381yM8G/grafik.png';
        document.getElementById('user-name').innerText = user.name || user.username;
        
        // Fetch economy balance
        await updateEconomyBalance();
        
        // Show app dashboard
        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        showToast(`Willkommen zurück, ${user.displayName || user.username}!`, 'info');
        
    } catch (err) {
        console.error('Authentication check failed:', err);
        localStorage.removeItem('token');
        showLoginScreen();
    }
};

const showLoginScreen = () => {
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-container').classList.remove('hidden');
};

// Fetch current economy balance and update DOM values
const updateEconomyBalance = async () => {
    try {
        const resBalance = await fetch(`${BACKEND_URL}/api/casino/balance`, { headers: getHeaders() });
        if (!resBalance.ok) return;
        
        const eco = await resBalance.json();
        userBalance = eco.balance;
        dailyCasesCount = eco.dailyCases;
        
        // Update header & screens
        document.getElementById('header-balance').innerText = userBalance.toLocaleString('de-DE');
        document.getElementById('header-free-cases').innerText = dailyCasesCount;
        
        // Toggle gratis crate visibility in Cases Arena
        const freeCrateCard = document.querySelector('.crate-card.gratis');
        if (freeCrateCard) {
            if (dailyCasesCount > 0) {
                freeCrateCard.classList.remove('hidden');
                document.getElementById('header-free-cases-btn').classList.remove('hidden');
                freeCrateCard.querySelector('.crate-cost').innerText = `${dailyCasesCount}x Gratis`;
            } else {
                freeCrateCard.classList.add('hidden');
                document.getElementById('header-free-cases-btn').classList.add('hidden');
                // If the free crate was active but is now empty, fallback to copper crate
                if (freeCrateCard.classList.contains('active')) {
                    freeCrateCard.classList.remove('active');
                    const copperCrate = document.querySelector('[data-crate="100"]');
                    if (copperCrate) copperCrate.classList.add('active');
                }
            }
        }
    } catch (err) {
        console.error('Failed to update balance:', err);
    }
};

// Discord authorization redirect
document.getElementById('discord-login-btn').addEventListener('click', () => {
    const currentOrigin = window.location.origin + window.location.pathname;
    window.location.href = `${BACKEND_URL}/api/auth/discord?redirect=${encodeURIComponent(currentOrigin)}`;
});

// Logout handler
document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token');
    showToast('Abgemeldet!', 'info');
    showLoginScreen();
});

// Navigation menu Tab switcher
document.querySelectorAll('.nav-menu .nav-item').forEach(button => {
    button.addEventListener('click', () => {
        const tab = button.getAttribute('data-tab');
        
        // Set active item state
        document.querySelectorAll('.nav-menu .nav-item').forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        
        // Toggle tab sections display
        document.querySelectorAll('.tab-content').forEach(sect => sect.classList.remove('active'));
        document.getElementById(`tab-${tab}`).classList.add('active');
        
        activeTab = tab;
        playSound('deal');
        
        // Special case: clicking header gratis-cases navigates directly to cases opening tab
        if (tab === 'cases') {
            updateEconomyBalance();
        }
    });
});

document.getElementById('header-free-cases-btn').addEventListener('click', () => {
    const casesNavItem = document.querySelector('[data-tab="cases"]');
    if (casesNavItem) casesNavItem.click();
});


/* ==========================================
   🎰 SLOTS MACHINE CLIENT LOGIC
   ========================================== */
const SLOT_SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣', '🍀', '⭐', '🔔'];

// Quick Bet button triggers
document.querySelectorAll('.btn-quick-bet').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-quick-bet').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const amount = btn.getAttribute('data-amount');
        const input = document.getElementById('slots-bet-input');
        if (amount === 'all_in') {
            input.value = userBalance;
        } else {
            input.value = amount;
        }
    });
});

document.getElementById('slots-spin-btn').addEventListener('click', async () => {
    const betInput = document.getElementById('slots-bet-input');
    const betAmountRaw = betInput.value;
    
    // Disable inputs
    const spinBtn = document.getElementById('slots-spin-btn');
    spinBtn.disabled = true;
    betInput.disabled = true;
    document.getElementById('slots-result-card').classList.add('hidden');
    
    // Start temporary looping animation on wheels
    const reel1 = document.getElementById('reel-1').querySelector('.reel-strip');
    const reel2 = document.getElementById('reel-2').querySelector('.reel-strip');
    const reel3 = document.getElementById('reel-3').querySelector('.reel-strip');
    
    reel1.style.transition = 'none';
    reel2.style.transition = 'none';
    reel3.style.transition = 'none';
    
    let spinInterval = setInterval(() => {
        playSound('spin');
        // Shuffle strips visually
        const roll1 = Math.floor(Math.random() * -360);
        const roll2 = Math.floor(Math.random() * -360);
        const roll3 = Math.floor(Math.random() * -360);
        reel1.style.transform = `translateY(${roll1}px)`;
        reel2.style.transform = `translateY(${roll2}px)`;
        reel3.style.transform = `translateY(${roll3}px)`;
    }, 100);

    try {
        const res = await fetch(`${BACKEND_URL}/api/casino/slots`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ betAmountRaw })
        });
        
        const result = await res.json();
        clearInterval(spinInterval);
        
        if (!res.ok) {
            showToast(result.error || 'Slots fehlgeschlagen', 'error');
            playSound('lose');
            spinBtn.disabled = false;
            betInput.disabled = false;
            return;
        }
        
        // Renders final result wheels statically mapping slots index
        const buildReelHTML = (reelArr) => {
            return reelArr.map(symbol => `<div>${symbol}</div>`).join('');
        };
        
        // Populate the actual reel arrays returned by backend
        reel1.innerHTML = buildReelHTML(result.reels[0]);
        reel2.innerHTML = buildReelHTML(result.reels[1]);
        reel3.innerHTML = buildReelHTML(result.reels[2]);
        
        // Decelerate stopped transition
        reel1.style.transition = 'transform 0.8s cubic-bezier(0.1, 0.8, 0.2, 1)';
        reel2.style.transition = 'transform 1.3s cubic-bezier(0.1, 0.8, 0.2, 1)';
        reel3.style.transition = 'transform 1.8s cubic-bezier(0.1, 0.8, 0.2, 1)';
        
        // Center the middle row (Index 1 is centered perfectly when translateY = -60px)
        reel1.style.transform = 'translateY(-60px)';
        reel2.style.transform = 'translateY(-60px)';
        reel3.style.transform = 'translateY(-60px)';
        
        // Delay results showing until animation stops
        setTimeout(async () => {
            await updateEconomyBalance();
            
            const resultCard = document.getElementById('slots-result-card');
            const resultIcon = document.getElementById('slots-result-icon');
            const resultTitle = document.getElementById('slots-result-title');
            const resultDesc = document.getElementById('slots-result-desc');
            
            resultCard.className = 'result-card glass-panel';
            resultCard.classList.remove('hidden');
            
            if (result.isJackpot) {
                resultCard.classList.add('jackpot-result');
                resultIcon.innerHTML = '👑';
                resultTitle.innerText = '✨ DIAMANTEN JACKPOT!!! ✨';
                resultDesc.innerHTML = `Unglaublich! Du hast die 3x Diamanten geknackt! Gewonnen: <strong>${result.wonAmount} Coins</strong> & 20% Rabatt-Ticket!`;
                triggerCoinExplosion();
            } else if (result.won) {
                resultCard.classList.add('win-result');
                resultIcon.innerHTML = '🎉';
                resultTitle.innerText = 'GEWONNEN!';
                resultDesc.innerHTML = `Glückwunsch! Die Symbole matchen. Gewinn: <strong>${result.wonAmount} Coins</strong>!`;
                triggerCoinExplosion();
            } else {
                resultCard.classList.add('lose-result');
                resultIcon.innerHTML = '💀';
                resultTitle.innerText = 'VERLOREN!';
                resultDesc.innerHTML = `Pech gehabt! Keine Übereinstimmung. Einsatz verloren.`;
                playSound('lose');
            }
            
            spinBtn.disabled = false;
            betInput.disabled = false;
            
        }, 1900);
        
    } catch (err) {
        clearInterval(spinInterval);
        showToast('Netzwerkfehler beim Spielen', 'error');
        spinBtn.disabled = false;
        betInput.disabled = false;
    }
});


/* ==========================================
   🎡 ROULETTE CLIENT LOGIC
   ========================================== */
const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

// Quick bet size
document.querySelectorAll('.btn-quick-bet-r').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-quick-bet-r').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const amount = btn.getAttribute('data-amount');
        const input = document.getElementById('roulette-bet-input');
        if (amount === 'all_in') {
            input.value = userBalance;
        } else {
            input.value = amount;
        }
    });
});

// Interactive bet option buttons
document.querySelectorAll('.btn-bet-option').forEach(btn => {
    btn.addEventListener('click', () => {
        const bet = btn.getAttribute('data-bet');
        
        // Handle single number active states
        if (bet === 'number') {
            const numInput = document.getElementById('roulette-number-input');
            numInput.disabled = false;
            numInput.focus();
            currentRouletteBet = `number:${numInput.value || 0}`;
        } else {
            document.getElementById('roulette-number-input').disabled = true;
            currentRouletteBet = bet;
        }
        
        document.querySelectorAll('.btn-bet-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        document.getElementById('roulette-selected-bet-display').innerHTML = 
            `Gewählte Wette: <strong>${btn.innerText.split(' x')[0]}</strong>`;
    });
});

// Single number keypress input updates
document.getElementById('roulette-number-input').addEventListener('input', (e) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 0) val = 0;
    if (val > 36) val = 36;
    e.target.value = val;
    currentRouletteBet = `number:${val}`;
    document.getElementById('roulette-selected-bet-display').innerHTML = 
        `Gewählte Wette: <strong>🎯 Zahl ${val}</strong>`;
});

// Roll Roulette
document.getElementById('roulette-spin-btn').addEventListener('click', async () => {
    if (!currentRouletteBet) {
        showToast('Bitte wähle zuerst eine Wette aus!', 'error');
        return;
    }
    
    const betInput = document.getElementById('roulette-bet-input');
    const betAmountRaw = betInput.value;
    const spinBtn = document.getElementById('roulette-spin-btn');
    
    spinBtn.disabled = true;
    betInput.disabled = true;
    document.getElementById('roulette-result-card').classList.add('hidden');
    
    // Visual Wheel spin rotation loops
    const wheel = document.getElementById('roulette-wheel-spin');
    const ball = document.getElementById('roulette-ball');
    
    wheel.style.transition = 'none';
    ball.style.transition = 'none';
    
    // Spin rapidly
    wheel.style.transform = 'rotate(0deg)';
    ball.style.transform = 'translate(-50%, -50%) rotate(0deg)';
    
    setTimeout(() => {
        // High rotation vectors
        wheel.style.transition = 'transform 4s cubic-bezier(0.1, 0.8, 0.1, 1)';
        ball.style.transition = 'transform 4s cubic-bezier(0.05, 0.9, 0.15, 1)';
        
        // Loop 6-8 full spins
        const wheelRot = 1440 + Math.floor(Math.random() * 360);
        const ballRot = -1800 - Math.floor(Math.random() * 360);
        
        wheel.style.transform = `rotate(${wheelRot}deg)`;
        ball.style.transform = `translate(-50%, 0px) rotate(${ballRot}deg)`;
    }, 50);
    
    // Quick ticking sound generator during rotation
    let tickCount = 0;
    let tickInterval = setInterval(() => {
        if (tickCount < 25) {
            playSound('spin');
            tickCount++;
        } else {
            clearInterval(tickInterval);
        }
    }, 150);

    try {
        const res = await fetch(`${BACKEND_URL}/api/casino/roulette`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ betAmountRaw, betType: currentRouletteBet })
        });
        
        const result = await res.json();
        
        if (!res.ok) {
            clearInterval(tickInterval);
            showToast(result.error || 'Roulette fehlgeschlagen', 'error');
            playSound('lose');
            spinBtn.disabled = false;
            betInput.disabled = false;
            return;
        }
        
        // Display outcome once rotation decelerates
        setTimeout(async () => {
            await updateEconomyBalance();
            
            // Set Pocket lights in center wheel displays
            const pocketDisplay = document.getElementById('roulette-pocket-display');
            pocketDisplay.className = `pocket-display ${result.pocket === 0 ? 'green' : RED_NUMBERS.has(result.pocket) ? 'red' : 'black'}`;
            pocketDisplay.innerHTML = `<span>${result.pocketColor} ${result.pocket}</span>`;
            
            const resultCard = document.getElementById('roulette-result-card');
            const resultIcon = document.getElementById('roulette-result-icon');
            const resultTitle = document.getElementById('roulette-result-title');
            const resultDesc = document.getElementById('roulette-result-desc');
            
            resultCard.className = 'result-card glass-panel';
            resultCard.classList.remove('hidden');
            
            if (result.won) {
                resultCard.classList.add('win-result');
                resultIcon.innerHTML = '🎉';
                resultTitle.innerText = 'GEWONNEN!';
                resultDesc.innerHTML = `Ausgezeichnet! Kugel landete auf **${result.pocketColor} ${result.pocket}**. Gewinn: <strong>${result.wonAmount} Coins</strong>!`;
                triggerCoinExplosion();
            } else {
                resultCard.classList.add('lose-result');
                resultIcon.innerHTML = '💀';
                resultTitle.innerText = 'VERLOREN!';
                resultDesc.innerHTML = `Pech gehabt! Die Kugel landete auf **${result.pocketColor} ${result.pocket}** (${result.pocketColorName}). Einsatz verloren.`;
                playSound('lose');
            }
            
            spinBtn.disabled = false;
            betInput.disabled = false;
            
        }, 4100);
        
    } catch (err) {
        clearInterval(tickInterval);
        showToast('Roulette Netzwerkfehler', 'error');
        spinBtn.disabled = false;
        betInput.disabled = false;
    }
});


/* ==========================================
   📦 CASES OPENING CLIENT LOGIC
   ========================================== */

// Handle crate selection clicks
document.addEventListener('click', (e) => {
    const card = e.target.closest('.crate-card');
    if (!card) return;
    
    document.querySelectorAll('.crate-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    
    playSound('deal');
});

document.getElementById('open-case-btn').addEventListener('click', async () => {
    const activeCrate = document.querySelector('.crate-card.active');
    if (!activeCrate) {
        showToast('Bitte wähle zuerst eine Kiste aus!', 'error');
        return;
    }
    
    const caseValue = activeCrate.getAttribute('data-crate');
    const openBtn = document.getElementById('open-case-btn');
    
    openBtn.disabled = true;
    document.getElementById('cases-result-card').classList.add('hidden');
    
    // Setup Tape Conveyor animations
    const tape = document.getElementById('case-tape');
    tape.style.transition = 'none';
    tape.style.transform = 'translateX(0px)';
    tape.innerHTML = '';
    
    try {
        const res = await fetch(`${BACKEND_URL}/api/casino/cases`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ caseValue })
        });
        
        const result = await res.json();
        
        if (!res.ok) {
            showToast(result.error || 'Case Opening fehlgeschlagen', 'error');
            playSound('lose');
            openBtn.disabled = false;
            return;
        }
        
        // Renders visual panels along tape
        const items = result.scrollStream;
        items.forEach((item, index) => {
            const tapeItem = document.createElement('div');
            tapeItem.className = 'case-tape-item';
            tapeItem.style.setProperty('--item-color', item.color);
            
            // Highlight centered win item
            if (index === 10) {
                tapeItem.id = 'case-winner-panel';
            }
            
            tapeItem.innerHTML = `
                <span class="item-emoji">${item.label.split(' ')[0]}</span>
                <span class="item-label">${item.label.substring(item.label.indexOf(' ') + 1)}</span>
                <span class="item-rarity">${item.name}</span>
            `;
            tape.appendChild(tapeItem);
        });
        
        // High fidelity case deceleration spin
        // Conveyor widths: item = 140px, margin = 8px. Total per item = 148px.
        // Winner resides at Index 10. Distance = 10 * 148px = 1480px.
        // Adding a randomized sub-item offset (e.g. 5px to 135px) to prevent tape from landing exactly centered on every spin, creating an authentic feel!
        const randomInnerOffset = 20 + Math.floor(Math.random() * 100);
        const scrollDist = -(10 * 148 + randomInnerOffset);
        
        setTimeout(() => {
            tape.style.transition = 'transform 4.5s cubic-bezier(0.1, 0.8, 0.1, 1)';
            tape.style.transform = `translateX(${scrollDist}px)`;
            
            // Play scroll tick sounds at accelerating/decelerating intervals
            let tickCount = 0;
            const playTick = () => {
                if (tickCount < 18) {
                    playSound('spin');
                    tickCount++;
                    // Quadratic ease deceleration logic for tick sounds
                    const delay = 100 + (tickCount * tickCount * 12);
                    setTimeout(playTick, delay);
                }
            };
            playTick();
        }, 50);
        
        setTimeout(async () => {
            await updateEconomyBalance();
            
            // Apply scale pop on winning panel
            const winPanel = document.getElementById('case-winner-panel');
            if (winPanel) {
                winPanel.style.transform = 'scale(1.1)';
                winPanel.style.boxShadow = `0 0 25px ${result.winningItem.color}`;
            }
            
            const resultCard = document.getElementById('cases-result-card');
            const resultIcon = document.getElementById('cases-result-icon');
            const resultTitle = document.getElementById('cases-result-title');
            const resultDesc = document.getElementById('cases-result-desc');
            
            resultCard.className = 'result-card glass-panel';
            resultCard.classList.remove('hidden');
            
            const label = result.winningItem.label;
            const wonAmount = result.wonAmount;
            
            if (result.isJackpot) {
                resultCard.classList.add('jackpot-result');
                resultIcon.innerHTML = '🎟️';
                resultTitle.innerText = '🎟️ SPECIAL JACKPOT!!! 🎟️';
                resultDesc.innerHTML = `UNGLAUBLICH! Du hast den Jackpot gezogen: **${label}**!\nDu hast **${wonAmount} Coins** gewonnen, das **20% Rabatt-Ticket** und die **Jackpot-Rolle** erhalten!`;
                triggerCoinExplosion();
            } else if (result.winningItem.tier === 'niete') {
                resultCard.classList.add('lose-result');
                resultIcon.innerHTML = '💀';
                resultTitle.innerText = 'KOMPLETTE NIETE!';
                resultDesc.innerHTML = `Das war leider absolut gar nichts! Gezogen: **${label}** (-${caseValue === 'free' ? 0 : caseValue} Coins Loss).`;
                playSound('lose');
            } else if (result.wonAmount > (caseValue === 'free' ? 0 : parseInt(caseValue, 10))) {
                resultCard.classList.add('win-result');
                resultIcon.innerHTML = '🎉';
                resultTitle.innerText = 'MEGA GEWINN!';
                resultDesc.innerHTML = `Glückwunsch! Gezogen: **${label}**. Payout: <strong>${wonAmount} Coins</strong>!`;
                triggerCoinExplosion();
            } else {
                resultCard.className = 'result-card glass-panel'; // Normal display
                resultCard.style.borderLeft = `4px solid ${result.winningItem.color}`;
                resultIcon.innerHTML = '📦';
                resultIcon.style.color = result.winningItem.color;
                resultTitle.innerText = 'KISTE GEÖFFNET';
                resultDesc.innerHTML = `Gezogen: **${label}** (${result.winningItem.name}). Gewinn: <strong>${wonAmount} Coins</strong>.`;
                playSound('coin');
            }
            
            openBtn.disabled = false;
            
        }, 4700);
        
    } catch (err) {
        showToast('Kisten Netzwerkfehler', 'error');
        openBtn.disabled = false;
    }
});


/* ==========================================
   🃏 BLACKJACK CLIENT CARD DEALER LOGIC
   ========================================== */

// Helper to render card structures
const buildCardHTML = (card) => {
    if (card.rank === '??') {
        return `<div class="playing-card facedown"></div>`;
    }
    
    const isRed = ['♥️', '♦️'].includes(card.suit);
    return `
        <div class="playing-card ${isRed ? 'red-suit' : ''}">
            <div class="card-top">
                <span>${card.rank}</span>
                <span>${card.suit}</span>
            </div>
            <div class="card-suit-center">${card.suit}</div>
            <div class="card-bottom">
                <span>${card.rank}</span>
                <span>${card.suit}</span>
            </div>
        </div>
    `;
};

// Quick bet buttons
document.querySelectorAll('.btn-quick-bet-bj').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-quick-bet-bj').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const amount = btn.getAttribute('data-amount');
        const input = document.getElementById('bj-bet-input');
        if (amount === 'all_in') {
            input.value = userBalance;
        } else {
            input.value = amount;
        }
    });
});

// Update blackjack UI with active game state
const renderBjBoard = (game) => {
    // Render Dealer cards
    const dContainer = document.getElementById('bj-dealer-cards');
    dContainer.innerHTML = '';
    game.dealerHand.forEach(card => {
        dContainer.innerHTML += buildCardHTML(card);
    });
    document.getElementById('bj-dealer-score').innerText = game.dealerValue;
    
    // Render Player cards
    const pContainer = document.getElementById('bj-player-cards');
    pContainer.innerHTML = '';
    game.playerHand.forEach(card => {
        pContainer.innerHTML += buildCardHTML(card);
    });
    document.getElementById('bj-player-score').innerText = game.playerValue;
    
    // Display controls based on tab state
    if (game.status === 'playing') {
        document.getElementById('bj-pregame-controls').classList.add('hidden');
        document.getElementById('bj-ingame-controls').classList.remove('hidden');
        document.getElementById('bj-current-bet-display').innerText = `${game.betAmount} Coins`;
        
        // Hide double down button if player drew cards
        const dBtn = document.getElementById('bj-double-btn');
        if (game.playerHand.length === 2 && userBalance >= game.betAmount) {
            dBtn.classList.remove('hidden');
        } else {
            dBtn.classList.add('hidden');
        }
    } else {
        document.getElementById('bj-pregame-controls').classList.remove('hidden');
        document.getElementById('bj-ingame-controls').classList.add('hidden');
        renderBjResultBanner(game);
    }
};

const renderBjResultBanner = (game) => {
    const card = document.getElementById('bj-result-card');
    const icon = document.getElementById('bj-result-icon');
    const title = document.getElementById('bj-result-title');
    const desc = document.getElementById('bj-result-desc');
    
    card.className = 'result-card glass-panel';
    card.classList.remove('hidden');
    
    if (game.status === 'win' || game.status === 'blackjack') {
        card.classList.add('win-result');
        icon.innerHTML = '🎉';
        title.innerText = game.status === 'blackjack' ? '✨ BLACKJACK! ✨' : 'DU HAST GEWONNEN!';
        desc.innerHTML = game.status === 'blackjack' 
            ? `Unglaublich, perfekte 21! Gewinn: <strong>${game.wonAmount} Coins</strong> (x2.5)!`
            : `Glückwunsch! Du hast das Haus geschlagen. Gewinn: <strong>${game.wonAmount} Coins</strong>!`;
        triggerCoinExplosion();
    } else if (game.status === 'push') {
        card.classList.add('win-result');
        card.style.borderColor = 'rgba(255, 215, 0, 0.3)';
        icon.innerHTML = '⚖️';
        title.innerText = 'UNENTSCHIEDEN';
        desc.innerHTML = `Gleichstand mit dem Dealer. Du erhältst deinen Einsatz zurück: <strong>${game.wonAmount} Coins</strong>.`;
        playSound('coin');
    } else {
        card.classList.add('lose-result');
        icon.innerHTML = '💀';
        title.innerText = 'VERLOREN!';
        desc.innerHTML = game.playerValue > 21 
            ? `Überkauft! Dein Score beträgt ${game.playerValue}. Einsatz verloren.`
            : `Schade! Der Dealer schlägt dich mit ${game.dealerValue} zu ${game.playerValue}. Einsatz verloren.`;
        playSound('lose');
    }
};

// Deal blackjack cards
document.getElementById('bj-deal-btn').addEventListener('click', async () => {
    const betInput = document.getElementById('bj-bet-input');
    const betAmountRaw = betInput.value;
    
    const dealBtn = document.getElementById('bj-deal-btn');
    dealBtn.disabled = true;
    document.getElementById('bj-result-card').classList.add('hidden');
    
    try {
        const res = await fetch(`${BACKEND_URL}/api/casino/blackjack/start`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ betAmountRaw })
        });
        
        const result = await res.json();
        
        if (!res.ok) {
            showToast(result.error || 'Blackjack fehlgeschlagen', 'error');
            playSound('lose');
            dealBtn.disabled = false;
            return;
        }
        
        playSound('deal');
        setTimeout(() => playSound('deal'), 150);
        
        activeBjGame = result;
        renderBjBoard(activeBjGame);
        
        await updateEconomyBalance();
        dealBtn.disabled = false;
        
    } catch (err) {
        showToast('Blackjack Deal Netzwerkfehler', 'error');
        dealBtn.disabled = false;
    }
});

// Hit
document.getElementById('bj-hit-btn').addEventListener('click', async () => {
    const hitBtn = document.getElementById('bj-hit-btn');
    hitBtn.disabled = true;
    
    try {
        const res = await fetch(`${BACKEND_URL}/api/casino/blackjack/hit`, {
            method: 'POST',
            headers: getHeaders()
        });
        
        const result = await res.json();
        
        if (!res.ok) {
            showToast(result.error || 'Hit fehlgeschlagen', 'error');
            hitBtn.disabled = false;
            return;
        }
        
        playSound('deal');
        activeBjGame = result;
        renderBjBoard(activeBjGame);
        
        await updateEconomyBalance();
        hitBtn.disabled = false;
        
    } catch (err) {
        showToast('Netzwerkfehler beim Ziehen', 'error');
        hitBtn.disabled = false;
    }
});

// Stand
document.getElementById('bj-stand-btn').addEventListener('click', async () => {
    const standBtn = document.getElementById('bj-stand-btn');
    standBtn.disabled = true;
    
    try {
        const res = await fetch(`${BACKEND_URL}/api/casino/blackjack/stand`, {
            method: 'POST',
            headers: getHeaders()
        });
        
        const result = await res.json();
        
        if (!res.ok) {
            showToast(result.error || 'Stand fehlgeschlagen', 'error');
            standBtn.disabled = false;
            return;
        }
        
        playSound('deal');
        activeBjGame = result;
        renderBjBoard(activeBjGame);
        
        await updateEconomyBalance();
        standBtn.disabled = false;
        
    } catch (err) {
        showToast('Netzwerkfehler beim Halten', 'error');
        standBtn.disabled = false;
    }
});

// Double Down
document.getElementById('bj-double-btn').addEventListener('click', async () => {
    const dBtn = document.getElementById('bj-double-btn');
    dBtn.disabled = true;
    
    try {
        const res = await fetch(`${BACKEND_URL}/api/casino/blackjack/double`, {
            method: 'POST',
            headers: getHeaders()
        });
        
        const result = await res.json();
        
        if (!res.ok) {
            showToast(result.error || 'Double fehlgeschlagen', 'error');
            dBtn.disabled = false;
            return;
        }
        
        playSound('deal');
        activeBjGame = result;
        renderBjBoard(activeBjGame);
        
        await updateEconomyBalance();
        dBtn.disabled = false;
        
    } catch (err) {
        showToast('Netzwerkfehler beim Verdoppeln', 'error');
        dBtn.disabled = false;
    }
});


/* ==========================================
   🎁 DAILY GIFT BONUS CARD LOGIC
   ========================================== */
let cooldownTimer = null;

const startDailyCooldown = (hours, minutes) => {
    const display = document.getElementById('daily-cooldown-display');
    const timerText = document.getElementById('daily-time-remaining');
    const claimBtn = document.getElementById('claim-daily-btn');
    
    claimBtn.classList.add('hidden');
    display.classList.remove('hidden');
    
    let totalSeconds = (hours * 3600) + (minutes * 60);
    
    if (cooldownTimer) clearInterval(cooldownTimer);
    
    const updateTimer = () => {
        if (totalSeconds <= 0) {
            clearInterval(cooldownTimer);
            claimBtn.classList.remove('hidden');
            display.classList.add('hidden');
            return;
        }
        
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        
        timerText.innerText = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        totalSeconds--;
    };
    
    updateTimer();
    cooldownTimer = setInterval(updateTimer, 1000);
};

document.getElementById('claim-daily-btn').addEventListener('click', async () => {
    const claimBtn = document.getElementById('claim-daily-btn');
    claimBtn.disabled = true;
    
    // Play gift jumping animation keyframes triggers
    const giftIcon = document.getElementById('daily-gift-icon');
    giftIcon.style.animation = 'floatGift 0.3s ease-in-out infinite alternate';
    
    try {
        const res = await fetch(`${BACKEND_URL}/api/casino/daily`, {
            method: 'POST',
            headers: getHeaders()
        });
        
        const result = await res.json();
        giftIcon.style.animation = 'floatGift 3s ease-in-out infinite alternate';
        
        if (!res.ok) {
            if (result.remaining) {
                // Claimed already, start countdown immediately
                startDailyCooldown(result.remaining.hours, result.remaining.minutes);
                showToast(result.error, 'info');
            } else {
                showToast(result.error || 'Claim fehlgeschlagen', 'error');
            }
            claimBtn.disabled = false;
            playSound('lose');
            return;
        }
        
        // Claimed successfully!
        showToast('Glückwunsch! Du hast tägliche 100 Coins und 1 Gratis-Kiste eingesammelt!', 'success');
        triggerCoinExplosion();
        await updateEconomyBalance();
        
        // Cooldown countdown for next claim (24h)
        startDailyCooldown(24, 0);
        claimBtn.disabled = false;
        
    } catch (err) {
        giftIcon.style.animation = 'floatGift 3s ease-in-out infinite alternate';
        showToast('Daily Claim Netzwerkfehler', 'error');
        claimBtn.disabled = false;
    }
});


// On Load Check Authentication
window.addEventListener('load', async () => {
    await checkAuth();
});
