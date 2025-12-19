const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:8000/api' 
    : 'http://localhost:8000/api';

// Debug helper
function logDebug(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const style = type === 'error' ? 'color: #ff4757; font-weight: bold;' : 
                 type === 'success' ? 'color: #2ed573; font-weight: bold;' : 
                 'color: #1e90ff;';
    console.log(`%c[DEBUG ${timestamp}] ${message}`, style);
}

// Helper to generate stars HTML
function generateStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    let html = '';
    
    for (let i = 1; i <= 5; i++) {
        if (i <= fullStars) {
            html += `<i class="fas fa-star" data-value="${i}"></i>`;
        } else if (i === fullStars + 1 && hasHalfStar) {
            html += `<i class="fas fa-star-half-alt" data-value="${i}"></i>`;
        } else {
            html += `<i class="far fa-star" data-value="${i}"></i>`;
        }
    }
    return html;
}

// Newsletter handler
async function handleNewsletter(event) {
    event.preventDefault();
    const emailInput = document.getElementById('newsletterEmail');
    const button = event.target.querySelector('button');
    const originalText = button.textContent;
    const email = emailInput.value;

    if (!email) return;

    button.textContent = 'Subscribing...';
    button.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/newsletter/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (data.ok) {
            button.textContent = 'Subscribed!';
            button.style.backgroundColor = 'var(--success)';
            emailInput.value = '';
            setTimeout(() => {
                button.textContent = originalText;
                button.disabled = false;
                button.style.backgroundColor = '';
            }, 3000);
        } else {
            alert(data.message || 'Subscription failed. Please try again.');
            button.textContent = originalText;
            button.disabled = false;
        }
    } catch (error) {
        console.error('Newsletter error:', error);
        alert('Could not connect to server. Please ensure backend is running.');
        button.textContent = originalText;
        button.disabled = false;
    }
}


// Rating handler
async function rateProduct(productId, rating) {
    if (localStorage.getItem('greenishmart_logged_in') !== 'true') {
        alert('Please log in to rate products!');
        window.location.href = 'login.html';
        return;
    }

    const token = localStorage.getItem('greenishmart_token');
    
    try {
        const response = await fetch(`${API_BASE}/products/${productId}/rate/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ rating })
        });

        const data = await response.json();

        if (data.ok) {
            // Update the UI for this specific product card
            const productCard = document.querySelector(`.product-card[data-id="${productId}"]`);
            if (productCard) {
                const ratingContainer = productCard.querySelector('.product-rating');
                const starsDiv = ratingContainer.querySelector('.stars-interactive');
                const countSpan = ratingContainer.querySelector('span');
                
                starsDiv.innerHTML = generateStars(data.data.averageRating);
                countSpan.textContent = `(${data.data.reviewCount})`;
                
                // Visual feedback
                ratingContainer.style.transform = 'scale(1.1)';
                setTimeout(() => { ratingContainer.style.transform = 'scale(1)'; }, 200);
            }
        } else {
            alert(data.message || 'Failed to submit rating');
        }
    } catch (error) {
        console.error('Rating error:', error);
    }
}

// Product Display
async function loadProducts(params = {}) {
    const grid = document.getElementById('user-products-grid');
    const feedback = document.getElementById('search-feedback');
    if (!grid) return;

    // Show loading state
    grid.innerHTML = `
        <div class="loading-spinner" style="text-align: center; grid-column: 1/-1; padding: 40px;">
            <i class="fas fa-spinner fa-spin" style="font-size: 30px; color: var(--primary);"></i>
            <p>Scanning GreenishMart...</p>
        </div>
    `;

    try {
        const queryParams = new URLSearchParams(params).toString();
        const url = `${API_BASE}/products/${queryParams ? '?' + queryParams : ''}`;
        
        const response = await fetch(url);
        const data = await response.json();

        // New standardized response format: { ok: true, data: { results: [...] } }
        const products = data.ok && data.data ? data.data.results : [];

        if (products && products.length > 0) {
            // Show result status near search bar
            if (feedback && params.search) {
                feedback.innerHTML = `<i class="fas fa-check-circle" style="color: var(--primary);"></i> Found <strong>${products.length}</strong> items for "<strong>${params.search}</strong>"`;
                feedback.style.display = 'flex';
                feedback.style.borderColor = 'var(--primary)';
            } else if (feedback) {
                feedback.style.display = 'none';
            }

            grid.innerHTML = products.map(product => {
                // Ensure image URL is absolute
                let imageUrl = product.imageUrl || 'https://placehold.co/400';
                if (imageUrl && !imageUrl.startsWith('http')) {
                    const mediaBase = API_BASE.replace('/api', '');
                    imageUrl = `${mediaBase}${imageUrl}`;
                }

                return `
                <div class="product-card" data-id="${product.id}">
                    <div class="product-badges">
                        <span class="badge badge-hot">New</span>
                    </div>
                    <div class="product-image">
                        <img src="${imageUrl}" alt="${product.name}" onerror="this.src='https://placehold.co/400?text=Image+Not+Found'">
                        <div class="product-actions">
                            <button class="action-btn like-btn" data-id="${product.id}" title="Like">
                                <i class="far fa-heart"></i> <span class="like-count">${product.likes || 0}</span>
                            </button>
                            <button class="action-btn" title="Quick View"><i class="far fa-eye"></i></button>
                            <button class="action-btn" title="Compare"><i class="fas fa-sync-alt"></i></button>
                        </div>
                    </div>
                    <div class="product-info">
                        <div class="product-category">${product.category || 'General'}</div>
                        <h3 class="product-title"><a href="#">${product.name}</a></h3>
                        <div class="product-rating" data-id="${product.id}">
                            <div class="stars-interactive" title="Rate this product">
                                ${generateStars(product.averageRating || 0)}
                            </div>
                            <span>(${product.reviewCount || 0})</span>
                        </div>
                        <div class="product-price" style="display: flex; flex-direction: column; gap: 4px;">
                            <span class="current-price" style="font-size: 1.1rem; color: var(--primary-dark); font-weight: 700;">$${parseFloat(product.price_usd).toLocaleString()}</span>
                            <span class="naira-price" style="font-size: 0.9rem; color: var(--gray); font-weight: 500;">₦${parseFloat(product.price_ngn).toLocaleString()}</span>
                        </div>
                        <div class="product-location" style="font-size: 12px; color: #666; margin-top: 5px;">
                            <i class="fas fa-map-marker-alt"></i> ${product.location}
                        </div>
                        <button class="add-to-cart">Add to Cart</button>
                    </div>
                </div>
            `}).join('');

            // Automatically move to the searched thing
            if (params.search || params.category) {
                grid.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else {
            // Show NO RESULT status ONLY in the feedback bar near search input
            if (feedback && params.search) {
                feedback.innerHTML = `<i class="fas fa-exclamation-circle" style="color: var(--secondary);"></i> No results found for "<strong>${params.search}</strong>". Showing all listings.`;
                feedback.style.display = 'flex';
                feedback.style.borderColor = 'var(--secondary)';
                
                // If search failed, reload all products so the section isn't empty
                setTimeout(() => loadProducts(), 2000); 
            } else {
                grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--gray);">No products available at the moment.</div>`;
            }
        }
    } catch (error) {
        console.error('Failed to load products:', error);
        grid.innerHTML = `<div style="color: red; grid-column: 1/-1; text-align: center;">Failed to load products. Server might be offline.</div>`;
    }
}

// Search functionality with "Good Reflexes" (Debounced)
function initSearch() {
    const searchInput = document.querySelector('.search-container input');
    const searchBtn = document.querySelector('.search-btn');
    const categorySelect = document.getElementById('search-cat');
    let debounceTimer;

    if (searchInput) {
        const performSearch = async () => {
            const query = searchInput.value.trim();
            const category = categorySelect ? categorySelect.value : 'all';
            
            const params = {};
            if (query) params.search = query;
            if (category !== 'all') params.category = category;
            
            logDebug(`Searching for: "${query}" in category: ${category}`);
            
            // Visual feedback on button if it exists
            const originalBtnContent = searchBtn ? searchBtn.innerHTML : '';
            if (searchBtn) {
                searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                searchBtn.disabled = true;
            }

            try {
                await loadProducts(params);
            } finally {
                if (searchBtn) {
                    searchBtn.innerHTML = originalBtnContent;
                    searchBtn.disabled = false;
                }
            }
        };

        // Click search button
        if (searchBtn) {
            searchBtn.addEventListener('click', (e) => {
                e.preventDefault();
                logDebug('Search button clicked');
                performSearch();
            });
        }

        // Press Enter
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                performSearch();
            }
        });

        // Live Search (Debounced)
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                performSearch();
            }, 500);
        });

        // Category dropdown change
        if (categorySelect) {
            categorySelect.addEventListener('change', performSearch);
        }
    }

    // Category Quick Links (Sidebar & Nav)
    document.querySelectorAll('.sidebar-list a, .categories-dropdown a, .category-card').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const category = (link.querySelector('h3') || link.querySelector('span') || link).textContent.trim();
            logDebug(`Filtering category from link: ${category}`);
            
            if (categorySelect) {
                const options = Array.from(categorySelect.options);
                const matchingOption = options.find(opt => opt.text.toLowerCase().includes(category.toLowerCase()));
                if (matchingOption) categorySelect.value = matchingOption.value;
            }

            loadProducts({ category: category });
            const target = document.getElementById('user-products-grid');
            if (target) target.scrollIntoView({ behavior: 'smooth' });
        });
    });

    // Trending Search Hints
    document.querySelectorAll('.search-hints a').forEach(tag => {
        tag.addEventListener('click', (e) => {
            e.preventDefault();
            const query = tag.textContent.trim();
            if (searchInput) {
                searchInput.value = query;
                logDebug(`Trending tag clicked: ${query}`);
                loadProducts({ search: query });
                
                const target = document.getElementById('user-products-grid');
                if (target) target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

// Auth UI Update
function updateAuthUI() {
    const userStr = localStorage.getItem('greenishmart_user');
    const isLoggedIn = localStorage.getItem('greenishmart_logged_in') === 'true';
    
    if (isLoggedIn && userStr) {
        try {
            const user = JSON.parse(userStr);
            const authText = document.querySelector('.user-actions .action-item .action-text');
            if (authText) {
                authText.querySelector('span').textContent = `Hello, ${user.firstName || 'User'}`;
                authText.querySelector('strong').textContent = 'Logout';
                
                // Change link to logout or profile
                const authLink = document.querySelector('.user-actions .action-item');
                authLink.href = '#';
                authLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    logout();
                });
            }
        } catch (e) {
            console.error('Error parsing user data:', e);
        }
    }
}

function logout() {
    localStorage.removeItem('greenishmart_user');
    localStorage.removeItem('greenishmart_token');
    localStorage.removeItem('greenishmart_logged_in');
    window.location.reload();
}

// Slider functionality
document.addEventListener('DOMContentLoaded', function() {
    loadProducts();
    initSearch();
    updateAuthUI();

    // Initialize slider
    // Initialize slider
    const slides = document.querySelectorAll('.slide');
    const dots = document.querySelectorAll('.dot');
    const prevBtn = document.querySelector('.slider-prev');
    const nextBtn = document.querySelector('.slider-next');
    let currentSlide = 0;
    
    // Show slide function
    function showSlide(index) {
        // Hide all slides
        slides.forEach(slide => {
            slide.classList.remove('active');
        });
        
        // Remove active class from all dots
        dots.forEach(dot => {
            dot.classList.remove('active');
        });
        
        // Show current slide
        slides[index].classList.add('active');
        dots[index].classList.add('active');
        currentSlide = index;
    }
    
    // Next slide
    function nextSlide() {
        let nextIndex = currentSlide + 1;
        if (nextIndex >= slides.length) {
            nextIndex = 0;
        }
        showSlide(nextIndex);
    }
    
    // Previous slide
    function prevSlide() {
        let prevIndex = currentSlide - 1;
        if (prevIndex < 0) {
            prevIndex = slides.length - 1;
        }
        showSlide(prevIndex);
    }
    
    // Event listeners for buttons
    if (nextBtn) {
        nextBtn.addEventListener('click', nextSlide);
    }
    
    if (prevBtn) {
        prevBtn.addEventListener('click', prevSlide);
    }
    
    // Event listeners for dots
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            showSlide(index);
        });
    });
    
    // Auto slide every 5 seconds
    let slideInterval = setInterval(nextSlide, 5000);
    
    // Pause auto-slide when hovering over slider
    const sliderContainer = document.querySelector('.slider-container');
    if (sliderContainer) {
        sliderContainer.addEventListener('mouseenter', () => {
            clearInterval(slideInterval);
        });
        
        sliderContainer.addEventListener('mouseleave', () => {
            slideInterval = setInterval(nextSlide, 5000);
        });
    }
    
    // Flash sales countdown timer
    function updateFlashSalesTimer() {
        const hoursElement = document.querySelector('.hours');
        const minutesElement = document.querySelector('.minutes');
        const secondsElement = document.querySelector('.seconds');
        
        if (!hoursElement || !minutesElement || !secondsElement) return;
        
        let hours = parseInt(hoursElement.textContent);
        let minutes = parseInt(minutesElement.textContent);
        let seconds = parseInt(secondsElement.textContent);
        
        seconds--;
        
        if (seconds < 0) {
            seconds = 59;
            minutes--;
            
            if (minutes < 0) {
                minutes = 59;
                hours--;
                
                if (hours < 0) {
                    hours = 0;
                    minutes = 0;
                    seconds = 0;
                }
            }
        }
        
        hoursElement.textContent = hours.toString().padStart(2, '0');
        minutesElement.textContent = minutes.toString().padStart(2, '0');
        secondsElement.textContent = seconds.toString().padStart(2, '0');
    }
    
    // Update flash sales timer every second
    setInterval(updateFlashSalesTimer, 1000);
    
    // Daily deals countdown timer
    function updateDailyDealsTimer() {
        const timerValues = document.querySelectorAll('.timer-value');
        if (timerValues.length !== 3) return;
        
        let hours = parseInt(timerValues[0].textContent);
        let minutes = parseInt(timerValues[1].textContent);
        let seconds = parseInt(timerValues[2].textContent);
        
        seconds--;
        
        if (seconds < 0) {
            seconds = 59;
            minutes--;
            
            if (minutes < 0) {
                minutes = 59;
                hours--;
                
                if (hours < 0) {
                    hours = 0;
                    minutes = 0;
                    seconds = 0;
                }
            }
        }
        
        timerValues[0].textContent = hours.toString().padStart(2, '0');
        timerValues[1].textContent = minutes.toString().padStart(2, '0');
        timerValues[2].textContent = seconds.toString().padStart(2, '0');
    }
    
    // Expose functions to window for attribute-based event handlers
    window.loadProducts = loadProducts;
    window.initSearch = initSearch;
    window.rateProduct = rateProduct;

    // Update daily deals timer every second
    setInterval(updateDailyDealsTimer, 1000);
    
    // Add to cart functionality - Delegated event for dynamic content
    document.body.addEventListener('click', async function(e) {
        // Handle Like Button
        const likeBtn = e.target.closest('.like-btn');
        if (likeBtn) {
            e.preventDefault();
            const productId = likeBtn.getAttribute('data-id');
            const countSpan = likeBtn.querySelector('.like-count');
            const heartIcon = likeBtn.querySelector('i');

            try {
                const response = await fetch(`${API_BASE}/products/${productId}/like/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await response.json();
                if (data.ok) {
                    countSpan.textContent = data.data.likes;
                    heartIcon.classList.remove('far');
                    heartIcon.classList.add('fas');
                    heartIcon.style.color = '#e74c3c';
                    
                    // Small animation
                    likeBtn.style.transform = 'scale(1.2)';
                    setTimeout(() => { likeBtn.style.transform = 'scale(1)'; }, 200);
                }
            } catch (error) {
                console.error('Like error:', error);
            }
            return;
        }

        // Handle Star Rating Click
        const star = e.target.closest('.stars-interactive i');
        if (star) {
            e.preventDefault();
            const ratingContainer = star.closest('.product-rating');
            const productId = ratingContainer.getAttribute('data-id');
            const ratingValue = star.getAttribute('data-value');
            
            if (productId && ratingValue) {
                rateProduct(productId, ratingValue);
            }
            return;
        }

        if (e.target && e.target.classList.contains('add-to-cart')) {
            e.preventDefault();
            const button = e.target;
            
            const productCard = button.closest('.product-card');
            // Handle both product-title (new) and h3/h4 variations or fallbacks
            const titleElement = productCard.querySelector('.product-title a') || productCard.querySelector('.product-title') || productCard.querySelector('h3') || productCard.querySelector('h4');
            const priceElement = productCard.querySelector('.current-price') || productCard.querySelector('.price');
            
            const productTitle = titleElement ? titleElement.textContent : 'Item';
            const productPrice = priceElement ? priceElement.textContent : '$0.00';
            
            // Update cart badge
            const cartBadge = document.querySelector('.cart .badge');
            if (cartBadge) {
                let currentCount = parseInt(cartBadge.textContent);
                cartBadge.textContent = currentCount + 1;
            }
            
            // Update cart total
            const cartTotalElement = document.querySelector('.cart .action-text strong');
            if (cartTotalElement) {
                // simple parsing, removing $ and commas
                const currentTotal = parseFloat(cartTotalElement.textContent.replace(/[$,]/g, '')) || 0;
                const productPriceNum = parseFloat(productPrice.replace(/[$,]/g, '')) || 0;
                const newTotal = currentTotal + productPriceNum;
                cartTotalElement.textContent = '$' + newTotal.toFixed(2);
            }
            
            // Show success message
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="fas fa-check"></i> Added!';
            button.style.backgroundColor = 'var(--success)';
            
            // Reset button after 2 seconds
            setTimeout(() => {
                button.innerHTML = originalText;
                button.style.backgroundColor = '';
            }, 2000);
            
            // Animation effect
            productCard.style.transform = 'scale(1.05)';
            setTimeout(() => {
                productCard.style.transform = 'translateY(0)';
            }, 200);
        }
    });

    

    
    // Mobile menu toggle for smaller screens
    const categoriesBtn = document.querySelector('.categories-btn');
    const categoriesDropdown = document.querySelector('.categories-dropdown');
    
    if (window.innerWidth <= 768 && categoriesBtn && categoriesDropdown) {
        categoriesBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            categoriesDropdown.style.display = categoriesDropdown.style.display === 'flex' ? 'none' : 'flex';
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if (!categoriesBtn.contains(e.target) && !categoriesDropdown.contains(e.target)) {
                categoriesDropdown.style.display = 'none';
            }
        });
    }
});