document.querySelector('.retro-title').addEventListener('click', function() {
    alert('You clicked the title!');
});

document.addEventListener('DOMContentLoaded', function() {
    // Load and initialize GitHub Calendar
    async function loadGitHubCalendar() {
        const container = document.querySelector('#gh-cal');
        if (!container) return;
        
        container.innerHTML = '<div style="text-align: center; padding: 20px; font-style: italic;">Loading GitHub contributions...</div>';
        
        try {
            // Load the GitHub calendar library
            await loadScript('https://unpkg.com/github-calendar@latest/dist/github-calendar.min.js');
            await loadCSS('https://unpkg.com/github-calendar@latest/dist/github-calendar-responsive.css');
            
            if (typeof GitHubCalendar === 'function') {
                GitHubCalendar("#gh-cal", "SailingSF", { 
                    responsive: true, 
                    tooltips: true, 
                    global_stats: false, // Hide inaccurate stats
                    summary_text: "" 
                }).then(function() {
                    // Clean up the display after loading
                    cleanupCalendarDisplay();
                });
            }
        } catch (error) {
            console.error('Error loading GitHub calendar:', error);
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Unable to load GitHub contributions</div>';
        }
    }
    
    // Clean up the calendar display
    function cleanupCalendarDisplay() {
        const container = document.querySelector('#gh-cal');
        if (!container) return;
        
        // Remove any "Learn how we count contributions" links
        const learnLinks = container.querySelectorAll('a[href*="count"], a[href*="Learn"]');
        learnLinks.forEach(link => {
            if (link.parentElement) {
                link.parentElement.remove();
            }
        });
        
        // Remove any paragraphs containing "Learn how we count"
        const paragraphs = container.querySelectorAll('p');
        paragraphs.forEach(p => {
            if (p.textContent && p.textContent.includes('Learn how we count')) {
                p.remove();
            }
        });
        
        // Remove any footer with inaccurate stats
        const footer = container.querySelector('.contrib-footer');
        if (footer) {
            footer.remove();
        }
    }
    
    // Helper functions to load external resources
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    function loadCSS(href) {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = resolve;
            link.onerror = reject;
            document.head.appendChild(link);
        });
    }
    
    loadGitHubCalendar();
});