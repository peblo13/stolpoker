document.getElementById('contact-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const message = document.getElementById('message').value;
    const whatsappMessage = `Hello, I'm ${name}. Email: ${email}. Message: ${message}`;
    const whatsappUrl = `https://wa.me/601277473?text=${encodeURIComponent(whatsappMessage)}`;
    window.open(whatsappUrl, '_blank');
});

// Matrix-like code rain
const codeAnimation = document.querySelector('.code-animation');
const codeSnippets = [
    "const future = await createWebsite();",
    "function innovate() { return 'success'; }",
    "let design = 'futuristic';",
    "console.log('Hello, World!');",
    "if (creativity > 0) { buildAwesome(); }",
    "class WebDesigner { constructor() { this.skills = 'infinite'; } }",
    "async function deploy() { return 'live'; }",
    "let code = 'matrix';",
    "while (true) { innovate(); }",
    "document.querySelector('.hero').style.background = 'matrix';"
];

for (let i = 0; i < 20; i++) {
    const line = document.createElement('div');
    line.className = 'code-line';
    const text = codeSnippets[Math.floor(Math.random() * codeSnippets.length)];
    line.textContent = text;
    line.style.left = Math.random() * 100 + '%';
    const length = text.length;
    const typingDuration = length * 0.05; // 0.05s per char
    const delay = Math.random() * 5; // random delay
    line.style.animation = `typing ${typingDuration}s steps(${length}) forwards ${delay}s, fall 10s linear infinite ${delay + typingDuration + 0.5}s`;
    codeAnimation.appendChild(line);
}

// Scroll animations
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animate');
        }
    });
}, { threshold: 0.1 });

document.querySelectorAll('section').forEach(section => {
    observer.observe(section);
});