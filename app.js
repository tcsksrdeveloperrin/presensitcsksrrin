// --- CONFIGURATION ---
const SUPABASE_URL = "https://ubcjzcczplfakodxgajg.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViY2p6Y2N6cGxmYWtvZHhnYWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxODMwNDYsImV4cCI6MjA4NTc1OTA0Nn0.knzmrpJOqbZkduGIvZVK4zApoZiSXqCdhMVzcgkMaBE";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let userLocation = null;
let currentBranch = null;

// --- 1. AUTH & LOGOUT LOGIC ---
async function checkAuth() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const currentPage = window.location.pathname;

    if (!user && !currentPage.includes('login.html')) {
        window.location.href = 'login.html';
    }
}

async function logout() {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}

// --- 2. LOGIN LOGIC ---
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const btnLogin = loginForm.querySelector('button[type="submit"]');

        btnLogin.disabled = true;
        btnLogin.innerText = "Memproses...";

        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
            btnLogin.disabled = false;
            btnLogin.innerText = "Masuk";
            return alert("Login Gagal: " + error.message);
        }

        const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', data.user.id).single();
        if (profile.role === 'staff') window.location.href = 'index.html';
        else if (profile.role === 'manager') window.location.href = 'dashboard.html';
        else window.location.href = 'report.html'; // Sesuai nama file laporan owner kamu
    });
}

// --- 3. STAFF PAGE LOGIC (Hanya jalan jika ada elemen video) ---
const video = document.getElementById('video');
if (video) {
    initStaffPage();
}

async function initStaffPage() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabaseClient.from('profiles')
        .select('*, branches(*)')
        .eq('id', user.id).single();

    if (profile && profile.branches) {
        document.getElementById('userName').innerText = `Halo, ${profile.full_name}`;
        document.getElementById('branchName').innerText = `Cabang: ${profile.branches.name}`;
        currentBranch = profile.branches;

        setupCamera();
        startLocationWatch();
    }
}

function setupCamera() {
    if (video) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
            .then(stream => video.srcObject = stream)
            .catch(err => alert("Gagal akses kamera: " + err));
    }
}

function startLocationWatch() {
    if (!navigator.geolocation) return;
    
    navigator.geolocation.watchPosition((pos) => {
        userLocation = pos.coords;
        const dist = getDistance(userLocation.latitude, userLocation.longitude, currentBranch.lat, currentBranch.lng);
        const statusEl = document.getElementById('locationStatus');
        const btnAbsen = document.getElementById('btnAbsen');
        const coordsWatermark = document.getElementById('coordsWatermark');

        if (coordsWatermark) {
            coordsWatermark.innerText = `GPS: ${userLocation.latitude.toFixed(5)}, ${userLocation.longitude.toFixed(5)}`;
        }

        if (dist <= currentBranch.radius_meter) {
            statusEl.innerText = "Lokasi Sesuai (Siap Absen)";
            statusEl.className = "text-center text-sm font-bold text-green-500";
            if (btnAbsen) {
                btnAbsen.disabled = false;
                btnAbsen.classList.replace('bg-gray-400', 'bg-blue-600');
            }
        } else {
            statusEl.innerText = `Anda berada ${Math.round(dist)}m diluar area.`;
            statusEl.className = "text-center text-sm font-bold text-red-500";
            if (btnAbsen) {
                btnAbsen.disabled = true;
                btnAbsen.classList.replace('bg-blue-600', 'bg-gray-400');
            }
        }
    }, err => console.error(err), { enableHighAccuracy: true });
}

// --- 4. TIME LOGIC (WIB) ---
function updateTime() {
    const timeElement = document.getElementById('current-time');
    if (timeElement) {
        const now = new Date();
        const timeString = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        timeElement.innerText = `WIB: ${timeString}`;
    }
}
setInterval(updateTime, 1000);

// --- 5. DISTANCE CALCULATION ---
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- 6. SUBMIT ATTENDANCE (FIXED COLUMN MAPPING) ---
async function submitAttendance() {
    const btn = document.getElementById('btnAbsen');
    const attendanceType = document.getElementById('attendanceType');

    if (!video || !userLocation) return alert("Kamera atau Lokasi belum siap!");

    btn.disabled = true;
    btn.innerText = "Proses Mengirim...";

    try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        const photoData = canvas.toDataURL('image/jpeg', 0.7);

        const { data: { user } } = await supabaseClient.auth.getUser();
        
        // MAPPING KOLOM: notes (tipe), check_in (waktu), photo_url (foto)
        const { error: insErr } = await supabaseClient.from('attendance').insert([{
            user_id: user.id,
            branch_id: currentBranch.id,
            notes: attendanceType.value, // Kolom 'notes' sesuai DB terbaru
            check_in: new Date().toISOString(), // Kolom 'check_in' sesuai DB terbaru
            photo_url: photoData,
            distance_meters: getDistance(userLocation.latitude, userLocation.longitude, currentBranch.lat, currentBranch.lng),
            status: 'Valid'
        }]);

        if (insErr) throw insErr;

        alert("Presensi " + attendanceType.value + " Berhasil!");
        location.reload();

    } catch (err) {
        alert("Gagal: " + err.message);
        btn.disabled = false;
        btn.innerText = "Ambil Foto & Kirim";
    }
}

// --- 7. INITIALIZATION ---
checkAuth();
document.addEventListener('DOMContentLoaded', () => {
    const btnAbsen = document.getElementById('btnAbsen');
    if (btnAbsen) btnAbsen.addEventListener('click', submitAttendance);
});
