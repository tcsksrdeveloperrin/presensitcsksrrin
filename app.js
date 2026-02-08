// --- 1. CONFIGURATION ---
const SUPABASE_URL = "https://ubcjzcczplfakodxgajg.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViY2p6Y2N6cGxmYWtvZHhnYWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxODMwNDYsImV4cCI6MjA4NTc1OTA0Nn0.knzmrpJOqbZkduGIvZVK4zApoZiSXqCdhMVzcgkMaBE";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 2. INITIALIZATION (Cek apakah elemen ada agar tidak BLANK) ---
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const btnAbsen = document.getElementById('btnAbsen');
const attendanceType = document.getElementById('attendanceType');

// Proteksi agar script tidak error jika dijalankan di halaman Dashboard/Owner
if (video) {
    setupCamera();
    setupLocation();
}

// --- 3. KAMERA & LOKASI ---
async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        video.srcObject = stream;
    } catch (err) {
        alert("Kamera tidak diizinkan atau tidak ditemukan.");
    }
}

function setupLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
            document.getElementById('locationStatus').innerText = "Lokasi Berhasil Didapat";
            document.getElementById('locationStatus').className = "text-center text-sm font-semibold text-green-500";
            document.getElementById('coordsWatermark').innerText = `GPS: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
            btnAbsen.disabled = false;
            btnAbsen.classList.replace('bg-gray-400', 'bg-blue-600');
        });
    }
}

// --- 4. PROSES ABSEN (FIX KOLOM NOTES & CHECK_IN) ---
btnAbsen.onclick = async () => {
    btnAbsen.disabled = true;
    btnAbsen.innerText = "Memproses...";

    try {
        // A. Ambil Foto dari Video
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const photoData = canvas.toDataURL('image/jpeg', 0.7);

        // B. Ambil User Info
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("User tidak ditemukan, silakan login ulang.");

        // C. Simpan ke Database
        // Pastikan nama kolom sesuai: 'check_in' dan 'notes'
        const { error } = await supabaseClient.from('attendance').insert([{
            user_id: user.id,
            check_in: new Date().toISOString(), //
            photo_url: photoData, // Jika belum pakai Storage, simpan base64 dulu
            notes: attendanceType.value, // MEMPERBAIKI ERROR 'TYPE'
            status: 'Valid' //
        }]);

        if (error) throw error;

        alert("Absensi " + attendanceType.value + " Berhasil!");
        location.reload();

    } catch (err) {
        console.error(err);
        alert("Gagal Absen: " + err.message);
        btnAbsen.disabled = false;
        btnAbsen.innerText = "Ambil Foto & Kirim";
    }
};

// --- 5. LOGOUT ---
async function logout() {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}

// Update jam setiap detik
setInterval(() => {
    const now = new Date();
    if(document.getElementById('current-time')) {
        document.getElementById('current-time').innerText = "WIB: " + now.toLocaleTimeString('id-ID');
    }
}, 1000);
