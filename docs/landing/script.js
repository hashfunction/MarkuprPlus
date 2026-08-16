/**
 * markuprx Landing Page Scripts
 * Handles navigation, animations, and interactions
 */

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initScrollAnimations();
    initSmoothScroll();
    initTypingEffect();
    initVideoPlayer();
});

/**
 * Navigation functionality
 * - Scroll-based style changes
 * - Mobile menu toggle
 */
function initNavigation() {
    const nav = document.getElementById('nav');
    const mobileToggle = document.querySelector('.nav-mobile-toggle');
    const navLinks = document.querySelector('.nav-links');

    // Scroll-based navigation styling
    let lastScroll = 0;
    const scrollThreshold = 50;

    function handleScroll() {
        const currentScroll = window.pageYOffset;

        // Add/remove scrolled class
        if (currentScroll > scrollThreshold) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }

        // Hide/show nav on scroll (optional)
        if (currentScroll > lastScroll && currentScroll > 200) {
            nav.style.transform = 'translateY(-100%)';
        } else {
            nav.style.transform = 'translateY(0)';
        }

        lastScroll = currentScroll;
    }

    window.addEventListener('scroll', throttle(handleScroll, 100));

    // Mobile menu toggle
    if (mobileToggle && navLinks) {
        mobileToggle.addEventListener('click', () => {
            mobileToggle.classList.toggle('active');
            navLinks.classList.toggle('active');
        });

        // Close mobile menu when clicking a link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                mobileToggle.classList.remove('active');
                navLinks.classList.remove('active');
            });
        });
    }
}

/**
 * Animate on Scroll (AOS) implementation
 * Lightweight custom implementation
 */
function initScrollAnimations() {
    const animatedElements = document.querySelectorAll('[data-aos]');

    if (!animatedElements.length) return;

    const observerOptions = {
        root: null,
        rootMargin: '0px 0px -10% 0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const delay = entry.target.dataset.aosDelay || 0;
                setTimeout(() => {
                    entry.target.classList.add('aos-animate');
                }, delay);
                // Optionally unobserve after animation
                // observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    animatedElements.forEach(el => {
        observer.observe(el);
    });
}

/**
 * Smooth scroll for anchor links
 */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') return;

            const target = document.querySelector(href);
            if (!target) return;

            e.preventDefault();

            const navHeight = document.getElementById('nav').offsetHeight;
            const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight;

            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });

            // Update URL without jumping
            history.pushState(null, null, href);
        });
    });
}

/**
 * Typing effect for hero transcript
 */
function initTypingEffect() {
    const transcript = document.querySelector('.transcript-line.typing');
    if (!transcript) return;

    const text = transcript.textContent;
    transcript.textContent = '';
    transcript.style.opacity = '1';

    let charIndex = 0;
    const typingSpeed = 30;

    function type() {
        if (charIndex < text.length) {
            transcript.textContent = text.slice(0, charIndex + 1);
            charIndex++;
            setTimeout(type, typingSpeed);
        } else {
            // Restart after pause
            setTimeout(() => {
                charIndex = 0;
                transcript.textContent = '';
                type();
            }, 5000);
        }
    }

    // Start typing when element is in view
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                setTimeout(type, 1000);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    observer.observe(transcript);
}

/**
 * Video player placeholder
 * Click to play functionality
 */
function initVideoPlayer() {
    const playButton = document.querySelector('.play-button');
    const videoPlaceholder = document.querySelector('.video-placeholder');

    if (!playButton || !videoPlaceholder) return;

    playButton.addEventListener('click', () => {
        // Replace with actual video embed when available
        const videoContainer = document.createElement('div');
        videoContainer.style.cssText = `
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg-card);
        `;
        videoContainer.innerHTML = `
            <p style="color: var(--text-secondary); text-align: center; padding: 2rem;">
                Video coming soon!<br>
                <small>The demo video will be embedded here.</small>
            </p>
        `;

        videoPlaceholder.appendChild(videoContainer);
        playButton.style.display = 'none';
    });
}

/**
 * Utility: Throttle function
 * Limits how often a function can be called
 */
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Utility: Debounce function
 * Delays function execution until after wait period
 */
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

/**
 * Easter egg: Konami code unlocks something fun
 */
const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiIndex = 0;

document.addEventListener('keydown', (e) => {
    if (e.key === konamiCode[konamiIndex]) {
        konamiIndex++;
        if (konamiIndex === konamiCode.length) {
            activateEasterEgg();
            konamiIndex = 0;
        }
    } else {
        konamiIndex = 0;
    }
});

function activateEasterEgg() {
    document.body.style.transition = 'filter 0.5s ease';
    document.body.style.filter = 'hue-rotate(180deg)';

    setTimeout(() => {
        document.body.style.filter = '';
    }, 3000);

    console.log('🎙️ markuprx Easter Egg Activated!');
}

/**
 * Waveform animation enhancement
 * Randomize heights for more natural look
 */
function animateWaveforms() {
    const waveforms = document.querySelectorAll('.waveform span, .voice-wave span');

    waveforms.forEach(bar => {
        setInterval(() => {
            const randomHeight = Math.floor(Math.random() * 20) + 8;
            bar.style.height = `${randomHeight}px`;
        }, 200);
    });
}

// Initialize waveform animation after page load
window.addEventListener('load', () => {
    setTimeout(animateWaveforms, 1000);
});

/**
 * Preload critical resources
 */
function preloadResources() {
    // Preload fonts
    const fontPreloads = [
        'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'
    ];

    fontPreloads.forEach(href => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'style';
        link.href = href;
        document.head.appendChild(link);
    });
}

// Run preload
preloadResources();

/**
 * Track download button clicks (analytics placeholder)
 */
document.querySelectorAll('.download-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
        const platform = this.closest('.download-card').querySelector('.download-title').textContent;
        console.log(`Download clicked: ${platform}`);

        // Placeholder for actual analytics
        // analytics.track('download_click', { platform });
    });
});

/**
 * Add loading state to CTA buttons
 */
document.querySelectorAll('.btn-primary, .btn-secondary').forEach(btn => {
    btn.addEventListener('click', function(e) {
        // Don't add loading state to anchor links
        if (this.getAttribute('href')?.startsWith('#')) return;

        this.classList.add('loading');
        this.style.pointerEvents = 'none';

        // Remove loading state after animation
        setTimeout(() => {
            this.classList.remove('loading');
            this.style.pointerEvents = '';
        }, 1000);
    });
});

/**
 * Console welcome message
 */
console.log(`
%c🎙️ markuprx
%cCapture developer feedback in seconds

Looking for a job? We're hiring!
Check out markuprx.com/careers

`, 'font-size: 24px; font-weight: bold; color: #6366F1;', 'font-size: 14px; color: #94A3B8;');
