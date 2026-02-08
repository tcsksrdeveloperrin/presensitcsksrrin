// --- 1. CONFIGURATION ---
const SUPABASE_URL = "https://ubcjzcczplfakodxgajg.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViY2p6Y2N6cGxmYWtvZHhnYWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxODMwNDYsImV4cCI6MjA4NTc1OTA0Nn0.knzmrpJOqbZkduGIvZVK4zApoZiSXqCdhMVzcgkMaBE";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 2. ELEMENTS ---
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const btnAbsen = document.getElementById('btnAbsen');
const attendanceType = document.getElementById('attendanceType');
const userNameEl = document.getElementById('userName');

// Proteksi: Hanya jalankan logika absen jika elemen video ada (mencegah blank page)
if (video) {
    initApp();
}

async function initApp() {
    await checkUser();
    setupCamera();
    setupLocation();
    startTimeUpdate();
}

// --- 3. LOGIC FUNCTIONS ---

async function checkUser() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    
    // Ambil Nama dari Profiles
    const { data: profile } = await supabaseClient
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();
    
    if (userNameEl) userNameEl.innerText = profile ? profile.full_name : "User";
}

async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user" }, 
            audio: false 
        });
        video.srcObject = stream;
    } catch (err) {
        console.error("Kamera Error:", err);
        alert("Mohon izinkan akses kamera untuk melakukan presensi.");
    }
}

function setupLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const statusEl = document.getElementById('locationStatus');
                if (statusEl) {
                    statusEl.innerText = "Lokasi Sesuai (Siap Absen)";
                    statusEl.className = "text-center text-sm font-semibold text-green-500";
                }
                if (btnAbsen) {
                    btnAbsen.disabled = false;
                    btnAbsen.classList.replace('bg-gray-400', 'bg-blue-600');
                }
                const coordsEl = document.getElementById('coordsWatermark');
                if (coordsEl) {
                    coordsEl.innerText = `GPS: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
                }
            },
            (err) => {
                alert("Gagal mendeteksi lokasi. Pastikan GPS aktif.");
            }
        );
    }
}

// --- 4. PROSES KIRIM ABSEN ---
if (btnAbsen) {
    btnAbsen.onclick = async () => {
        btnAbsen.disabled = true;
        btnAbsen.innerText = "Proses Mengirim...";

        try {
            // A. Capture Foto
            const context = canvas.getContext('2d');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const photoData = canvas.toDataURL('image/jpeg', 0.6);

            const { data: { user } } = await supabaseClient.auth.getUser();

            // B. Simpan ke Supabase
            const { error } = await supabaseClient
                .from('attendance')
                .insert([{
                    user_id: user.id,
                    check_in: new Date().toISOString(), // Kolom check_in
                    notes: attendanceType.value,       // Kolom notes (Fix error 'type')
                    photo_url: photoData,              // Kolom photo_url
                    status: 'Valid'                    // Kolom status
                }]);

            if (error) throw error;

            alert("Presensi " + attendanceType.value + " Berhasil Dicatat!");
            location.reload();

        } catch (err) {
            alert("Error: " + err.message);
            btnAbsen.disabled = false;
            btnAbsen.innerText = "Ambil Foto & Kirim";
        }
    };
}

// --- 5. UTILS ---
function startTimeUpdate() {
    setInterval(() => {
        const timeEl = document.getElementById('current-time');
        if (timeEl) {
            timeEl.innerText = "WIB: " + new Date().toLocaleTimeString('id-ID');
        }
    }, 1000);
}

async function logout() {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}
