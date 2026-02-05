// CONFIGURATION
const SUPABASE_URL = "https://ubcjzcczplfakodxgajg.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViY2p6Y2N6cGxmYWtvZHhnYWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxODMwNDYsImV4cCI6MjA4NTc1OTA0Nn0.knzmrpJOqbZkduGIvZVK4zApoZiSXqCdhMVzcgkMaBE";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let userLocation = null;
let currentBranch = null;

// --- 1. AUTH LOGIC (Running on all pages) ---
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
        if (profile.role === 'staff') window.location.href = 'index.html';
        else if (profile.role === 'manager') window.location.href = 'dashboard.html';
        else window.location.href = 'reports.html';
    });
}

// --- 3. STAFF PAGE LOGIC (index.html) ---
if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
    initStaffPage();
}

async function initStaffPage() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabaseClient.from('profiles')
        .select('*, branches(*)')
        .eq('id', user.id).single();

    if (profile) {
        document.getElementById('userName').innerText = `Halo, ${profile.full_name}`;
        document.getElementById('branchName').innerText = `Cabang: ${profile.branches.name}`;
        currentBranch = profile.branches;

        setupCamera();
        startLocationWatch();
    }
}

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
        const dist = getDistance(userLocation.latitude, userLocation.longitude, currentBranch.lat, currentBranch.lng);
        const statusEl = document.getElementById('locationStatus');
        const btnAbsen = document.getElementById('btnAbsen');

        document.getElementById('coordsWatermark').innerText = `GPS: ${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}`;

        if (dist <= currentBranch.radius_meter) {
            statusEl.innerText = "Lokasi Sesuai (Siap Absen)";
            statusEl.className = "text-center text-sm font-bold text-green-500";
            btnAbsen.disabled = false;
            btnAbsen.classList.replace('bg-gray-400', 'bg-blue-600');
        } else {
            statusEl.innerText = `Anda berada ${Math.round(dist)}m diluar area.`;
            statusEl.className = "text-center text-sm font-bold text-red-500";
            btnAbsen.disabled = true;
        }
    });
}

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function submitAttendance() {
    const btn = document.getElementById('btnAbsen');
    btn.disabled = true;
    btn.innerText = "Mengirim...";

    const canvas = document.createElement('canvas');
    const video = document.getElementById('video');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    const photoBlob = await new Promise(res => canvas.toBlob(res, 'image/jpeg'));
    const fileName = `${Date.now()}.jpg`;

    // Upload ke Storage
    const { data: upData, error: upErr } = await supabaseClient.storage
        .from('attendance-photos').upload(fileName, photoBlob);

    if (upErr) return alert("Gagal upload foto");

    const photoURL = `${SUPABASE_URL}/storage/v1/object/public/attendance-photos/${upData.path}`;

    // Simpan ke Database
    const user = (await supabaseClient.auth.getUser()).data.user;
    const { error: insErr } = await supabaseClient.from('attendance').insert([{
        user_id: user.id,
        branch_id: currentBranch.id,
        type: document.getElementById('attendanceType').value,
        photo_url: photoURL,
        distance_meters: getDistance(userLocation.latitude, userLocation.longitude, currentBranch.lat, currentBranch.lng),
        status: 'Valid',
        lat_log: `${userLocation.latitude},${userLocation.longitude}`
    }]);

    if (insErr) alert("Gagal simpan data");
    else {
        alert("Presensi Berhasil!");
        location.reload();
    }
}

function logout() {
    supabaseClient.auth.signOut().then(() => window.location.href = 'login.html');
}

checkAuth();