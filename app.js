// CONFIGURATION
const SUPABASE_URL = "https://ubcjzcczplfakodxgajg.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViY2p6Y2N6cGxmYWtvZHhnYWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxODMwNDYsImV4cCI6MjA4NTc1OTA0Nn0.knzmrpJOqbZkduGIvZVK4zApoZiSXqCdhMVzcgkMaBE";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let userLocation = null;
let currentBranch = null;

// --- 1. AUTH LOGIC ---
async function checkAuth() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const currentPage = window.location.pathname;

    if (!user && !currentPage.includes('login.html')) {
        window.location.href = 'login.html';
    }
}

// --- 2. LOGIN LOGIC ---
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) return alert("Login Gagal: " + error.message);

        const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', data.user.id).single();
        
        // LOGIKA REDIRECT
        if (profile.role === 'staff') {
            window.location.href = 'index.html';
        } else {
            // Manager DAN Owner (atau role lain) diarahkan ke dashboard.html
            window.location.href = 'dashboard.html';
        }
    });
}
// --- 3. STAFF PAGE LOGIC ---
if (window.location.pathname.includes('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/')) {
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

// --- FUNGSI SUBMIT FINAL ---
async function submitAttendance() {
    const btn = document.getElementById('btnAbsen');
    const video = document.getElementById('video');
    const typeInput = document.getElementById('attendanceType');

    if (!video || !userLocation || !currentBranch) return alert("Kamera, Lokasi, atau Data Cabang belum siap!");
    if (!typeInput) return alert("Pilihan Masuk/Pulang tidak ditemukan di HTML!");

    btn.disabled = true;
    btn.innerText = "Proses Mengirim...";

    try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);

        const photoBlob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8));
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;

        // 1. Upload Foto
        const { data: upData, error: upErr } = await supabaseClient.storage
            .from('attendance-photos').upload(fileName, photoBlob);

        if (upErr) throw new Error("Gagal upload foto: " + upErr.message);

        const photoURL = `${SUPABASE_URL}/storage/v1/object/public/attendance-photos/${upData.path}`;

        // 2. Simpan Data ke Tabel Attendance
        // PERHATIKAN: Kita menggunakan 'notes' karena kolom 'type' tidak ada di database
        const { data: { user } } = await supabaseClient.auth.getUser();
        const { error: insErr } = await supabaseClient.from('attendance').insert([{
            user_id: user.id,
            branch_id: currentBranch.id,
            photo_url: photoURL,
            status: 'Valid',
            lat_log: `${userLocation.latitude},${userLocation.longitude}`,
            distance_meters: getDistance(userLocation.latitude, userLocation.longitude, currentBranch.lat, currentBranch.lng),
            notes: typeInput.value // Mengisi kolom 'notes' dengan nilai (Masuk/Pulang)
        }]);

        if (insErr) throw insErr;

        alert("Presensi Berhasil Terkirim!");
        location.reload();

    } catch (err) {
        alert("Error: " + err.message);
        btn.disabled = false;
        btn.innerText = "Ambil Foto & Kirim";
    }
}

// --- 4. FUNGSI PENDUKUNG ---

function setupCamera() {
    const video = document.getElementById('video');
    if (video) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
            .then(stream => video.srcObject = stream)
            .catch(err => alert("Gagal akses kamera: " + err));
    }
}

function startLocationWatch() {
    navigator.geolocation.watchPosition((pos) => {
        userLocation = pos.coords;
        if (!currentBranch) return;

        const dist = getDistance(userLocation.latitude, userLocation.longitude, currentBranch.lat, currentBranch.lng);
        const statusEl = document.getElementById('locationStatus');
        const btnAbsen = document.getElementById('btnAbsen');

        document.getElementById('coordsWatermark').innerText = `GPS: ${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}`;

        if (dist <= currentBranch.radius_meter) {
            statusEl.innerText = "Lokasi Sesuai (Siap Absen)";
            statusEl.className = "text-center text-sm font-bold text-green-500";
            btnAbsen.disabled = false;
            btnAbsen.classList.remove('bg-gray-400');
            btnAbsen.classList.add('bg-blue-600');
        } else {
            statusEl.innerText = `Anda berada ${Math.round(dist)}m diluar area.`;
            statusEl.className = "text-center text-sm font-bold text-red-500";
            btnAbsen.disabled = true;
            btnAbsen.classList.add('bg-gray-400');
            btnAbsen.classList.remove('bg-blue-600');
        }
    }, err => console.error(err), { enableHighAccuracy: true });
}

function updateTime() {
    const now = new Date();
    const options = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    const timeString = now.toLocaleTimeString('id-ID', options);
    const timeElement = document.getElementById('current-time');
    if (timeElement) timeElement.innerText = `WIB: ${timeString}`;
}
setInterval(updateTime, 1000);
updateTime();

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function logout() {
    supabaseClient.auth.signOut().then(() => window.location.href = 'login.html');
}

// --- 5. INITIALIZATION ---
checkAuth();

document.addEventListener('DOMContentLoaded', () => {
    const btnAbsen = document.getElementById('btnAbsen');
    if (btnAbsen) {
        btnAbsen.addEventListener('click', submitAttendance);
    }
});

