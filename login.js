
// Initialize Supabase (Same config as app.js)
const supabaseUrl = 'https://peqjhtjjmznnttealylj.supabase.co';
const supabaseKey = 'sb_publishable_vLdmL_tasjgagQeqGL-QvA_JrrF9oQT';
const authClient = supabase.createClient(supabaseUrl, supabaseKey);

const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('errorMessage');
const btnText = document.getElementById('btnText');
const btnLoader = document.getElementById('btnLoader');

// Check if already logged in - using async check
async function checkSession() {
    const { data: { session } } = await authClient.auth.getSession();
    if (session) {
        window.location.href = 'index.html';
    }
}
checkSession();

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Clear error
    errorMessage.style.display = 'none';
    errorMessage.textContent = '';

    // Loading state
    btnText.style.display = 'none';
    btnLoader.style.display = 'inline';
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const email = emailInput.value;
    const password = passwordInput.value;

    try {
        const { data, error } = await authClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        // Success - redirect will happen automatically via onAuthStateChange or manual redirect
        window.location.href = 'index.html';

    } catch (error) {
        console.error('Login error:', error);
        errorMessage.textContent = error.message || 'Invalid login credentials';
        errorMessage.style.display = 'block';

        // Reset button
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
        submitBtn.disabled = false;
    }
});
