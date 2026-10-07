// public/app.js

const sectionOrder = ['home', 'services', 'b2b-portal', 'b2c-shop', 'contact'];
let currentSectionIndex = 0;

function showSection(sectionId) {
    const targetIndex = sectionOrder.indexOf(sectionId);
    const isMovingRight = targetIndex > currentSectionIndex || (currentSectionIndex === sectionOrder.length - 1 && targetIndex === 0);
    currentSectionIndex = targetIndex !== -1 ? targetIndex : 0;

    const sections = document.querySelectorAll('main > section');
    const targetSection = document.getElementById(sectionId);
    
    if (!targetSection) return;

    sections.forEach(sec => {
        sec.classList.remove('active-section', 'hidden-section', 'section-slide-left', 'section-slide-right');
        sec.classList.add('hidden-section');
    });

    targetSection.classList.remove('hidden-section');

    if (isMovingRight) {
        targetSection.classList.add('section-slide-right');
    } else {
        targetSection.classList.add('section-slide-left');
    }
    
    const globalVideo = document.getElementById('global-video-bg');
    if (globalVideo) {
        if (sectionId === 'home') {
            globalVideo.style.opacity = '1';
        } else {
            globalVideo.style.opacity = '0';
        }
    }

    const navButtons = document.querySelectorAll('header nav button');
    navButtons.forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick') || '';
        if (onclickAttr && onclickAttr.includes(sectionId)) {
            btn.style.textDecoration = 'underline';
            btn.style.textUnderlineOffset = '6px';
            btn.style.textDecorationThickness = '2px';
            btn.style.color = 'var(--text-main)';
        } else {
            btn.style.textDecoration = 'none';
            btn.style.color = 'var(--text-muted)';
        }
    });

    if (sectionId === 'b2b-portal') {
        resizeViewer();
    }
}

const viewerElement = document.getElementById('3d-viewer');
let scene, camera, renderer, controls;

if (viewerElement) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc); 

    camera = new THREE.PerspectiveCamera(75, viewerElement.clientWidth / viewerElement.clientHeight, 0.1, 1000);
    camera.position.set(0, -150, 100);
    camera.up.set(0, 0, 1); 

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(viewerElement.clientWidth, viewerElement.clientHeight);
    viewerElement.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, -100, 100);
    scene.add(directionalLight);
}

let currentMesh = null;
let currentGeometry = null;
let currentSize = null;
let currentInfill = 0.20; 
let currentB2bQty = 1;
let selectedMaterial = null;
let selectedColorHex = '#f97316';

let activeProduct = null;
let activeSelectedColor = 'Standard';
let activeSelectedSize = '';
let activeBasePrice = 0;
let currentImageIndex = 0;

let shopCatalog = []; 
let shopCategories = ['Shop']; 
let activeCategory = 'All';
let availableFonts = []; 

// Dynamic Shipping Store Settings (synced from MongoDB)
let storeConfig = {
    standardShippingFee: 5.00,
    freeShippingThreshold: 50.00
};

function showToast(message, isError = false) {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.cssText = 'position: fixed; bottom: 25px; right: 25px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; align-items: flex-end; pointer-events: none;';
        document.body.appendChild(toastContainer);
    }
    const toast = document.createElement('div');
    toast.style.cssText = `background: ${isError ? '#ef4444' : '#10b981'}; color: white; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 0.95rem; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.15); opacity: 0; transform: translateX(50px); transition: opacity 0.3s ease, transform 0.3s ease; pointer-events: auto;`;
    toast.innerHTML = (isError ? '⚠️ ' : '✅ ') + message;
    toastContainer.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    });
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function optimizeImageUrl(url) {
    if (!url) return '';
    if (url.indexOf('cloudinary.com') !== -1 && url.indexOf('f_auto') === -1) {
        return url.replace('/upload/', '/upload/f_auto,q_auto/');
    }
    return url;
}

let cart = JSON.parse(localStorage.getItem('zvorm_cart')) || [];

function saveCart() {
    localStorage.setItem('zvorm_cart', JSON.stringify(cart));
}

window.addEventListener('DOMContentLoaded', () => {
    fetchMaterialsAndConfig();
    fetchShopProducts();
    initCartUI();
    updateCartUI(); 
    initMinimalArrows();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('order') === 'success') {
        const orderRef = urlParams.get('ref') || 'Z-Vorm Order';
        
        cart = [];
        saveCart();
        updateCartUI();

        const banner = document.createElement('div');
        banner.style.cssText = "background: #dcfce7; color: #166534; border-bottom: 1px solid #bbf7d0; padding: 1.2rem 2rem; text-align: center; font-weight: 600; font-size: 0.95rem; position: sticky; top: 74px; z-index: 99; box-shadow: 0 4px 6px rgba(0,0,0,0.02);";
        banner.innerHTML = `✓ Payment Successful! Thank you for your order. Reference: <strong>${orderRef}</strong>. A confirmation receipt has been emailed to you and our workshop is preparing your print batch.`;
        document.body.prepend(banner);
        
        const newUrl = new URL(window.location);
        newUrl.searchParams.delete('order');
        newUrl.searchParams.delete('ref');
        window.history.replaceState({}, '', newUrl);
    }

    if (document.getElementById('home')) {
        showSection('home');
    }
});

function initMinimalArrows() {
    if (!document.getElementById('nav-arrow-left') && document.getElementById('home')) {
        const leftArrow = document.createElement('button');
        leftArrow.id = 'nav-arrow-left';
        leftArrow.title = 'Previous Section';
        leftArrow.onclick = () => navigateSections(-1);
        leftArrow.style.cssText = "position: fixed; left: 25px; top: 50%; transform: translateY(-50%); background: transparent; border: none; color: currentColor; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 2500; transition: opacity 0.2s ease, transform 0.2s ease; font-size: 2.2rem; opacity: 0.6;";
        leftArrow.innerHTML = '‹';
        leftArrow.onmouseenter = () => { leftArrow.style.opacity = '1'; leftArrow.style.transform = 'translateY(-50%) scale(1.15)'; };
        leftArrow.onmouseleave = () => { leftArrow.style.opacity = '0.6'; leftArrow.style.transform = 'translateY(-50%) scale(1)'; };
        document.body.appendChild(leftArrow);
    }

    if (!document.getElementById('nav-arrow-right') && document.getElementById('home')) {
        const rightArrow = document.createElement('button');
        rightArrow.id = 'nav-arrow-right';
        rightArrow.title = 'Next Section';
        rightArrow.onclick = () => navigateSections(1);
        rightArrow.style.cssText = "position: fixed; right: 25px; top: 50%; transform: translateY(-50%); background: transparent; border: none; color: currentColor; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 2500; transition: opacity 0.2s ease, transform 0.2s ease; font-size: 2.2rem; opacity: 0.6;";
        rightArrow.innerHTML = '›';
        rightArrow.onmouseenter = () => { rightArrow.style.opacity = '1'; rightArrow.style.transform = 'translateY(-50%) scale(1.15)'; };
        rightArrow.onmouseleave = () => { rightArrow.style.opacity = '0.6'; rightArrow.style.transform = 'translateY(-50%) scale(1)'; };
        document.body.appendChild(rightArrow);
    }
}

function navigateSections(direction) {
    currentSectionIndex = (currentSectionIndex + direction + sectionOrder.length) % sectionOrder.length;
    showSection(sectionOrder[currentSectionIndex]);
}

async function fetchMaterialsAndConfig() {
    try {
        const response = await fetch('/api/settings');
        const data = await response.json();
        if (data && data.calculator) {
            storeConfig.standardShippingFee = data.calculator.standardShippingFee ?? 5.00;
            storeConfig.freeShippingThreshold = data.calculator.freeShippingThreshold ?? 50.00;
        }
        if (data && data.materials) {
            renderMaterialSelector(data.materials);
        }
        if (data && data.fonts) {
            availableFonts = data.fonts;
            availableFonts.forEach(font => {
                if (font.url && font.url.trim() !== '') {
                    if (!document.querySelector(`link[href="${font.url}"]`)) {
                        const link = document.createElement('link');
                        link.rel = 'stylesheet';
                        link.href = font.url;
                        document.head.appendChild(link);
                    }
                }
            });
        }
        updateCartUI();
    } catch (err) {
        console.error('Failed to load store settings:', err);
    }
}

async function fetchShopProducts() {
    try {
        const response = await fetch('/api/settings');
        const data = await response.json();
        
        if (data && data.products) {
            shopCatalog = data.products;
            shopCategories = data.categories || ['Shop'];
            
            if (data.calculator) {
                storeConfig.standardShippingFee = data.calculator.standardShippingFee ?? 5.00;
                storeConfig.freeShippingThreshold = data.calculator.freeShippingThreshold ?? 50.00;
            }

            if (data.fonts) {
                availableFonts = data.fonts;
            }

            const urlParams = new URLSearchParams(window.location.search);
            const deepLinkItemId = urlParams.get('item');

            renderShopProducts('All');
            
            if (deepLinkItemId) {
                const targetProduct = shopCatalog.find(p => p.id == deepLinkItemId);
                if (targetProduct) {
                    openProductModal(targetProduct);
                }
            }
        }
    } catch (err) {
        console.error('Failed to load shop catalog:', err);
    }
}

function renderCategoryFilters() {
    const gridContainer = document.getElementById('catalog-grid') || document.querySelector('#b2c-shop .capabilities-grid');
    if (!gridContainer) return;
    
    let filterDiv = document.getElementById('category-filters');
    
    if (!filterDiv) {
        filterDiv = document.createElement('div');
        filterDiv.id = 'category-filters';
        filterDiv.style.cssText = 'display: flex; gap: 0.8rem; margin-bottom: 2rem; overflow-x: auto; padding-bottom: 0.5rem;';
        gridContainer.parentNode.insertBefore(filterDiv, gridContainer);
    }
    
    const categories = ['All', ...shopCategories];
    
    filterDiv.innerHTML = categories.map(cat => `
        <button onclick="renderShopProducts('${cat}')" style="padding: 0.5rem 1.2rem; border-radius: 20px; border: 1px solid ${cat === activeCategory ? 'var(--primary)' : 'var(--border)'}; background: ${cat === activeCategory ? 'var(--primary)' : 'white'}; color: ${cat === activeCategory ? 'white' : 'var(--text-main)'}; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s; box-shadow: ${cat === activeCategory ? '0 4px 6px -1px rgba(249,115,22,0.2)' : 'none'};">
            ${cat}
        </button>
    `).join('');
}

function renderShopProducts(category = 'All') {
    activeCategory = category;
    renderCategoryFilters();
    
    const gridContainer = document.getElementById('catalog-grid') || document.querySelector('#b2c-shop .capabilities-grid');
    if (!gridContainer) return;

    gridContainer.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 2rem;
    `;

    gridContainer.innerHTML = '';
    
    const filteredProducts = category === 'All' ? shopCatalog : shopCatalog.filter(p => (p.category || 'Shop') === category);

    if (filteredProducts.length === 0) {
        gridContainer.innerHTML = '<p style="color: var(--text-muted); grid-column: 1 / -1;">No products found in this category.</p>';
        return;
    }

    filteredProducts.forEach(p => {
        const rawImgUrl = (p.images && p.images.length > 0) ? p.images[0] : (p.image || '/uploads/default.jpg');
        const optimizedImgUrl = optimizeImageUrl(rawImgUrl);
        const badgeHtml = p.leadTimeBadge ? `<span style="font-size: 0.7rem; color: #0284c7; background: #e0f2fe; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 600; display: inline-block; margin-bottom: 0.5rem;">${p.leadTimeBadge}</span>` : '';
        
        const card = document.createElement('div');
        card.className = 'shop-card cap-card';
        card.style.cssText = `
            background: white; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; 
            cursor: pointer; transition: all 0.25s ease; display: flex; flex-direction: column; 
            justify-content: space-between; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);
        `;
        
        card.innerHTML = `
            <div style="position: relative; overflow: hidden; background: #f8fafc; height: 220px;">
                <img src="${optimizedImgUrl}" alt="${p.name}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease;">
            </div>
            <div style="padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 0.4rem; flex-grow: 1;">
                ${badgeHtml}
                <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-main); margin: 0;">${p.name}</h3>
                <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${p.description || 'High-precision manufactured accessory.'}</p>
                <div style="margin-top: auto; padding-top: 1.2rem; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9;">
                    <span style="color: var(--text-main); font-weight: 800; font-size: 1.15rem;">€${p.price.toFixed(2)}</span>
                    <span style="font-size: 0.8rem; font-weight: 600; color: var(--primary); letter-spacing: -0.01em;">View Item →</span>
                </div>
            </div>
        `;

        card.addEventListener('click', () => {
            openProductModal(p);
        });

        gridContainer.appendChild(card);
    });
}

function openProductModal(product) {
    activeProduct = product;
    activeBasePrice = product.price;
    currentImageIndex = 0;

    const titleEl = document.getElementById('modal-title');
    const priceEl = document.getElementById('modal-price');
    const descEl = document.getElementById('modal-desc');
    const qtyEl = document.getElementById('modal-qty');
    const modalEl = document.getElementById('product-modal');

    if (titleEl) titleEl.innerText = product.name;
    if (priceEl) priceEl.innerText = `€${product.price.toFixed(2)}`;
    if (descEl) descEl.innerText = product.description || 'No detailed description provided.';
    if (qtyEl) qtyEl.value = 1;

    const leadBadgeModal = document.getElementById('modal-lead-badge');
    if (leadBadgeModal) {
        leadBadgeModal.innerText = product.leadTimeBadge || '';
        leadBadgeModal.style.display = product.leadTimeBadge ? 'inline-block' : 'none';
    }

    updateModalGallery();

    const sizeContainer = document.getElementById('modal-size-container');
    const sizeSwatches = document.getElementById('modal-size-swatches');
    if (product.sizes && product.sizes.trim() !== '') {
        if (sizeContainer) sizeContainer.style.display = 'block';
        const sizeList = product.sizes.split(',').map(s => s.trim());
        activeSelectedSize = sizeList[0];
        if (sizeSwatches) {
            sizeSwatches.innerHTML = sizeList.map((sz, i) => `
                <button type="button" onclick="selectModalSize('${sz}', this)" style="padding: 0.4rem 0.9rem; border-radius: 6px; border: 1px solid ${i === 0 ? 'var(--primary)' : 'var(--border)'}; background: ${i === 0 ? '#fff7ed' : 'white'}; color: ${i === 0 ? 'var(--primary)' : 'var(--text-main)'}; font-weight: 600; cursor: pointer; font-size: 0.85rem;">${sz}</button>
            `).join('');
        }
    } else {
        if (sizeContainer) sizeContainer.style.display = 'none';
        activeSelectedSize = '';
    }

    const customTextContainer = document.getElementById('modal-custom-text-container');
    const customLetteringOptions = document.getElementById('custom-lettering-options');
    
    if (product.customTextEnabled && (product.name.toLowerCase().includes('letter') || product.name.toLowerCase().includes('logo'))) {
        if (customTextContainer) customTextContainer.style.display = 'none';
        if (customLetteringOptions) {
            customLetteringOptions.style.display = 'block';
            
            const fontSelect = document.getElementById('lettering-font-select');
            if (fontSelect) {
                if (availableFonts && availableFonts.length > 0) {
                    fontSelect.innerHTML = availableFonts.map(f => `<option value="${f.name}">${f.name}</option>`).join('');
                } else {
                    fontSelect.innerHTML = `
                        <option value="Montserrat">Montserrat</option>
                        <option value="Futura">Futura</option>
                        <option value="Playfair">Playfair Serif</option>
                        <option value="Impact">Impact Stencil</option>
                    `;
                }
            }

            const letteringTextInput = document.getElementById('lettering-text-input');
            if (letteringTextInput && !letteringTextInput.value) {
                letteringTextInput.value = 'Z-VORM';
            }
            updateLetteringPreview();
        }
    } else {
        if (customLetteringOptions) customLetteringOptions.style.display = 'none';
        const customTextInput = document.getElementById('modal-custom-text-input');
        if (product.customTextEnabled) {
            if (customTextContainer) customTextContainer.style.display = 'block';
            if (customTextInput) customTextInput.value = '';
        } else {
            if (customTextContainer) customTextContainer.style.display = 'none';
            if (customTextInput) customTextInput.value = '';
        }
    }

    const colorContainer = document.getElementById('modal-color-container');
    const swatchesEl = document.getElementById('modal-color-swatches');
    if (product.colors && product.colors.length > 0) {
        if (colorContainer) colorContainer.style.display = 'block';
        if (swatchesEl) {
            swatchesEl.innerHTML = product.colors.map((c, i) => `
                <div onclick="selectModalColor('${c.name}', this)" title="${c.name}" 
                     style="width: 28px; height: 28px; border-radius: 50%; background: ${c.hex}; cursor: pointer; border: 2px solid ${i === 0 ? 'var(--primary)' : '#cbd5e1'};"></div>
            `).join('');
        }
        activeSelectedColor = product.colors[0].name;
    } else {
        if (colorContainer) colorContainer.style.display = 'none';
        activeSelectedColor = 'Standard';
    }

    updateTotalPrice();
    if (modalEl) modalEl.style.display = 'flex';
    
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('item', product.id);
    window.history.pushState({}, '', newUrl);
}

function updateLetteringPreview() {
    const textInput = document.getElementById('lettering-text-input');
    const heightSelect = document.getElementById('lettering-height-select');
    const mountingSelect = document.getElementById('lettering-mounting-select');
    const fontSelect = document.getElementById('lettering-font-select');
    const stencilCheckbox = document.getElementById('lettering-stencil-checkbox');
    const charCountDisplay = document.getElementById('char-count-display');
    const livePreviewBox = document.getElementById('live-lettering-preview');
    const priceEl = document.getElementById('modal-total-price');

    const rawText = textInput ? textInput.value || 'Z-VORM' : 'Z-VORM';
    const heightTier = heightSelect ? heightSelect.value : '10cm';
    const mountingType = mountingSelect ? mountingSelect.value : 'wall';
    const selectedFont = fontSelect ? fontSelect.value : 'Montserrat';
    const addStencil = stencilCheckbox ? stencilCheckbox.checked : false;

    const billedCharacters = rawText.replace(/\s+/g, '');
    const charCount = billedCharacters.length;

    if (charCountDisplay) {
        charCountDisplay.innerText = `${charCount} billable characters (${rawText.length} total with spaces)`;
    }

    const heightPrices = {
        "5cm": 2.00,
        "10cm": 3.00,
        "15cm": 4.00,
        "20cm": 5.00
    };
    
    const pricePerLetter = heightPrices[heightTier] || 3.00;
    let total = charCount * pricePerLetter;

    const qtyInput = document.getElementById('modal-qty');
    const qty = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
    total *= qty;

    if (priceEl) priceEl.innerText = `€${total.toFixed(2)}`;

    if (livePreviewBox) {
        livePreviewBox.innerText = rawText;
        
        let fontFamilyRule = 'sans-serif';
        const foundFont = availableFonts.find(f => f.name === selectedFont);
        if (foundFont && foundFont.family) {
            fontFamilyRule = foundFont.family;
        } else if (selectedFont === 'Futura') {
            fontFamilyRule = "'Century Gothic', sans-serif";
        } else if (selectedFont === 'Playfair') {
            fontFamilyRule = "'Playfair Display', serif";
        } else if (selectedFont === 'Impact') {
            fontFamilyRule = "Impact, sans-serif";
        } else {
            fontFamilyRule = `'${selectedFont}', sans-serif`;
        }

        livePreviewBox.style.fontFamily = fontFamilyRule;
    }
}

function updateModalGallery() {
    if (!activeProduct) return;
    const rawImages = (activeProduct.images && activeProduct.images.length > 0) ? activeProduct.images : [activeProduct.image || '/uploads/default.jpg'];
    const optimizedImages = rawImages.map(img => optimizeImageUrl(img));
    
    const mainImg = document.getElementById('modal-main-img');
    const thumbnailsEl = document.getElementById('modal-thumbnails');

    if (mainImg) mainImg.src = optimizedImages[currentImageIndex];

    if (thumbnailsEl) {
        thumbnailsEl.innerHTML = optimizedImages.map((img, idx) => `
            <img src="${img}" loading="lazy" onclick="currentImageIndex = ${idx}; updateModalGallery();" style="width: 50px; height: 50px; object-fit: cover; border-radius: 6px; border: 2px solid ${idx === currentImageIndex ? 'var(--primary)' : 'var(--border)'}; cursor: pointer;">
        `).join('');
    }
}

function selectModalColor(colorName, el) {
    activeSelectedColor = colorName;
    if (el && el.parentElement) {
        el.parentElement.querySelectorAll('div').forEach(d => d.style.borderColor = '#cbd5e1');
        el.style.borderColor = 'var(--primary)';
    }
}

function selectModalSize(sizeName, el) {
    activeSelectedSize = sizeName;
    if (el && el.parentElement) {
        el.parentElement.querySelectorAll('button').forEach(b => {
            b.style.borderColor = 'var(--border)';
            b.style.background = 'white';
            b.style.color = 'var(--text-main)';
        });
        el.style.borderColor = 'var(--primary)';
        el.style.background = '#fff7ed';
        el.style.color = 'var(--primary)';
    }
}

function adjustQty(change) {
    const qtyInput = document.getElementById('modal-qty');
    if (!qtyInput) return;
    let current = parseInt(qtyInput.value) || 1;
    current = Math.max(1, current + change);
    qtyInput.value = current;
    updateTotalPrice();
}

function updateTotalPrice() {
    const customLetteringOptions = document.getElementById('custom-lettering-options');
    if (customLetteringOptions && customLetteringOptions.style.display !== 'none') {
        updateLetteringPreview();
        return;
    }

    const qtyInput = document.getElementById('modal-qty');
    const priceEl = document.getElementById('modal-total-price');
    const qty = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
    const total = activeBasePrice * qty;
    if (priceEl) priceEl.innerText = `€${total.toFixed(2)}`;
}

function closeProductModal() {
    const modalEl = document.getElementById('product-modal');
    if (modalEl) modalEl.style.display = 'none';
    
    const newUrl = new URL(window.location);
    newUrl.searchParams.delete('item');
    window.history.pushState({}, '', newUrl);
}

function closeProductModalOnBackground(event) {
    if (event.target.id === 'product-modal') {
        closeProductModal();
    }
}

function submitShopOrder() {
    const qtyInput = document.getElementById('modal-qty');
    const qty = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
    
    const customLetteringOptions = document.getElementById('custom-lettering-options');
    const isLettering = customLetteringOptions && customLetteringOptions.style.display !== 'none';

    const productImages = (activeProduct.images && activeProduct.images.length > 0) ? activeProduct.images : [activeProduct.image || '/uploads/default.jpg'];

    let cartItem;

    if (isLettering) {
        const textInput = document.getElementById('lettering-text-input');
        const heightSelect = document.getElementById('lettering-height-select');
        const mountingSelect = document.getElementById('lettering-mounting-select');
        const fontSelect = document.getElementById('lettering-font-select');
        const stencilCheckbox = document.getElementById('lettering-stencil-checkbox');

        const rawText = textInput ? textInput.value || 'Z-VORM' : 'Z-VORM';
        const heightTier = heightSelect ? heightSelect.value : '10cm';
        const mountingType = mountingSelect ? mountingSelect.value : 'wall';
        const selectedFont = fontSelect ? fontSelect.value : 'Montserrat';
        const addStencil = stencilCheckbox ? stencilCheckbox.checked : false;

        const billedCharacters = rawText.replace(/\s+/g, '');
        const charCount = billedCharacters.length;

        const heightPrices = { "5cm": 2.00, "10cm": 3.00, "15cm": 4.00, "20cm": 5.00 };
        const pricePerLetter = heightPrices[heightTier] || 3.00;
        let unitPrice = charCount * pricePerLetter;

        cartItem = {
            id: activeProduct.id + '-' + activeSelectedColor + '-' + heightTier + '-' + mountingType + '-' + rawText,
            productId: activeProduct.id,
            name: activeProduct.name,
            price: unitPrice,
            qty: qty,
            color: activeSelectedColor,
            size: heightTier,
            customizations: {
                text: rawText,
                billableCount: charCount,
                height: heightTier,
                mounting: mountingType,
                font: selectedFont,
                stencil: addStencil,
                color: activeSelectedColor
            },
            image: productImages[0]
        };
    } else {
        const customTextInput = document.getElementById('modal-custom-text-input');
        const customText = customTextInput ? customTextInput.value.trim() : '';

        cartItem = {
            id: activeProduct.id + '-' + activeSelectedColor + '-' + activeSelectedSize + '-' + customText,
            productId: activeProduct.id,
            name: activeProduct.name,
            price: activeBasePrice,
            qty: qty,
            color: activeSelectedColor,
            size: activeSelectedSize,
            customText: customText,
            image: productImages[0]
        };
    }

    const existingIndex = cart.findIndex(item => item.id === cartItem.id);
    if (existingIndex > -1) {
        cart[existingIndex].qty += qty;
    } else {
        cart.push(cartItem);
    }

    saveCart();
    updateCartUI();
    closeProductModal();
    showToast(`${qty}x ${activeProduct.name} added to your bag!`);
    openCartDrawer();
}

function initCartUI() {
    const nav = document.querySelector('header nav') || document.querySelector('header div:last-child');
    if (nav && !document.getElementById('nav-cart-btn')) {
        const cartBtn = document.createElement('button');
        cartBtn.id = 'nav-cart-btn';
        cartBtn.title = 'Shopping Bag';
        cartBtn.style.cssText = "background: transparent !important; border: none !important; cursor: pointer; display: inline-flex; align-items: center; position: relative; margin-left: 1rem; padding: 0.5rem 0;";
        cartBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted); transition: color 0.2s ease;">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <path d="M16 10a4 4 0 0 1-8 0"></path>
            </svg>
            <span id="cart-count" style="position: absolute; top: 0px; right: -8px; background: var(--primary); color: white; font-size: 0.65rem; font-weight: 700; width: 16px; height: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">0</span>
        `;
        cartBtn.onmouseenter = () => cartBtn.querySelector('svg').style.color = 'var(--text-main)';
        cartBtn.onmouseleave = () => cartBtn.querySelector('svg').style.color = 'var(--text-muted)';
        cartBtn.onclick = toggleCartDrawer;
        nav.appendChild(cartBtn);
    }

    if (!document.getElementById('cart-drawer')) {
        const drawerDiv = document.createElement('div');
        drawerDiv.id = 'cart-drawer';
        drawerDiv.style.cssText = "position: fixed; top: 0; right: -420px; width: 400px; max-width: 100%; height: 100vh; background: white; z-index: 3000; box-shadow: -10px 0 25px rgba(0,0,0,0.15); display: flex; flex-direction: column; justify-content: space-between; padding: 2rem; transition: right 0.35s cubic-bezier(0.4, 0, 0.2, 1);";
        drawerDiv.innerHTML = `
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 1rem;">
                    <h3 style="font-size: 1.2rem; margin: 0;">Shopping Bag</h3>
                    <button onclick="toggleCartDrawer()" title="Close" style="background: none; border: none; font-size: 1.3rem; cursor: pointer; color: var(--text-main); font-weight: 700; padding: 0.2rem; transition: color 0.2s;" onmouseenter="this.style.color='var(--primary)'" onmouseleave="this.style.color='var(--text-main)'">✕</button>
                </div>
                <div id="cart-items-container" style="max-height: calc(100vh - 300px); overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;"></div>
            </div>
            <div style="border-top: 1px solid var(--border); padding-top: 1rem;" id="cart-footer-summary"></div>
        `;
        document.body.appendChild(drawerDiv);
    }

    if (!document.getElementById('checkout-modal')) {
        const checkoutModal = document.createElement('div');
        checkoutModal.id = 'checkout-modal';
        checkoutModal.style.cssText = "display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); z-index: 4000; align-items: center; justify-content: center; backdrop-filter: blur(4px);";
        checkoutModal.innerHTML = `
            <div style="background: white; width: 550px; max-width: 90%; border-radius: 16px; padding: 2.5rem; position: relative; max-height: 90vh; overflow-y: auto;">
                <button onclick="closeCheckoutModal()" title="Close" style="position: absolute; top: 1.2rem; right: 1.2rem; background: transparent; border: none; cursor: pointer; font-weight: 700; font-size: 1.3rem; color: var(--text-main); display: flex; align-items: center; justify-content: center; z-index: 10; transition: color 0.2s;" onmouseenter="this.style.color='var(--primary)'" onmouseleave="this.style.color='var(--text-main)'">✕</button>
                <h3 style="font-size: 1.4rem; margin-bottom: 0.5rem;">Shipping Information</h3>
                <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem;">Please provide your delivery address for order dispatch.</p>
                
                <form id="checkout-form" onsubmit="submitOrderDirect(event)" style="display: flex; flex-direction: column; gap: 1rem;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <div>
                            <label style="font-size: 0.85rem; font-weight: 600;">First Name</label>
                            <input type="text" name="firstName" required style="width: 100%; padding: 0.7rem; border-radius: 6px; border: 1px solid var(--border); margin-top: 0.2rem;">
                        </div>
                        <div>
                            <label style="font-size: 0.85rem; font-weight: 600;">Last Name</label>
                            <input type="text" name="lastName" required style="width: 100%; padding: 0.7rem; border-radius: 6px; border: 1px solid var(--border); margin-top: 0.2rem;">
                        </div>
                    </div>
                    <div>
                        <label style="font-size: 0.85rem; font-weight: 600;">Email Address</label>
                        <input type="email" name="email" required style="width: 100%; padding: 0.7rem; border-radius: 6px; border: 1px solid var(--border); margin-top: 0.2rem;">
                    </div>
                    <div>
                        <label style="font-size: 0.85rem; font-weight: 600;">Street Address & House Number</label>
                        <input type="text" name="street" required placeholder="Kerkstraat 12" style="width: 100%; padding: 0.7rem; border-radius: 6px; border: 1px solid var(--border); margin-top: 0.2rem;">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 1rem;">
                        <div>
                            <label style="font-size: 0.85rem; font-weight: 600;">Postal Code</label>
                            <input type="text" name="postalCode" required placeholder="2460" style="width: 100%; padding: 0.7rem; border-radius: 6px; border: 1px solid var(--border); margin-top: 0.2rem;">
                        </div>
                        <div>
                            <label style="font-size: 0.85rem; font-weight: 600;">City</label>
                            <input type="text" name="city" required placeholder="Retie" style="width: 100%; padding: 0.7rem; border-radius: 6px; border: 1px solid var(--border); margin-top: 0.2rem;">
                        </div>
                    </div>
                    <div>
                        <label style="font-size: 0.85rem; font-weight: 600;">Country</label>
                        <select name="country" required style="width: 100%; padding: 0.7rem; border-radius: 6px; border: 1px solid var(--border); margin-top: 0.2rem; background: white;">
                            <option value="BE">Belgium</option>
                            <option value="NL">Netherlands</option>
                            <option value="DE">Germany</option>
                            <option value="FR">France</option>
                        </select>
                    </div>
                    <button type="submit" style="margin-top: 1rem; width: 100%; background: var(--primary); color: white; border: none; padding: 0.9rem; border-radius: 8px; font-weight: 700; cursor: pointer;">Proceed to Payment →</button>
                </form>
            </div>
        `;
        document.body.appendChild(checkoutModal);
    }
}

function toggleCartDrawer() {
    const drawer = document.getElementById('cart-drawer');
    if (drawer) {
        if (drawer.style.right === '0px') {
            drawer.style.right = '-420px';
        } else {
            drawer.style.right = '0px';
        }
    }
}

function openCartDrawer() {
    const drawer = document.getElementById('cart-drawer');
    if (drawer) drawer.style.right = '0px';
}

function updateCartUI() {
    const countEl = document.getElementById('cart-count');
    const container = document.getElementById('cart-items-container');
    const cartFooter = document.getElementById('cart-footer-summary');

    const totalCount = cart.reduce((sum, item) => sum + item.qty, 0);
    if (countEl) countEl.innerText = totalCount;

    if (cart.length === 0) {
        if (container) container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 2rem 0;">Your shopping bag is empty.</p>`;
        if (cartFooter) {
            cartFooter.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <span style="font-weight: 600; color: var(--text-muted);">Subtotal:</span>
                    <span style="font-size: 1.3rem; font-weight: 800; color: var(--text-main);">€0.00</span>
                </div>
                <button onclick="proceedToCheckout()" style="width: 100%; background: var(--primary); color: white; border: none; padding: 0.9rem; border-radius: 8px; font-weight: 700; cursor: pointer;">Proceed to Checkout →</button>
            `;
        }
        return;
    }

    let subtotal = 0;
    if (container) {
        container.innerHTML = cart.map((item, index) => {
            subtotal += item.price * item.qty;
            let customDetailsHtml = '';
            if (item.customizations) {
                customDetailsHtml = `
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">
                        Text: "${item.customizations.text}"<br>
                        Height: ${item.customizations.height} | Mounting: ${item.customizations.mounting}<br>
                        Font: ${item.customizations.font} ${item.customizations.stencil ? '| Stencil (+€5)' : ''}
                    </div>
                `;
            } else {
                customDetailsHtml = `
                    <div style="font-size: 0.75rem; color: var(--text-muted);">
                        ${item.color !== 'Standard' ? `Color: ${item.color}` : ''} 
                        ${item.size ? `| Size: ${item.size}` : ''}
                        ${item.customText ? `<br>Custom Text: "${item.customText}"` : ''}
                    </div>
                `;
            }

            return `
                <div style="display: flex; gap: 1rem; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 1rem;">
                    <img src="${optimizeImageUrl(item.image)}" alt="${item.name}" loading="lazy" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border);">
                    <div style="flex-grow: 1;">
                        <h4 style="font-size: 0.95rem; margin: 0 0 0.2rem 0;">${item.name}</h4>
                        ${customDetailsHtml}
                        <div style="font-size: 0.85rem; font-weight: 700; color: var(--primary); margin-top: 0.3rem;">€${(item.price * item.qty).toFixed(2)} (${item.qty}x)</div>
                    </div>
                    <button onclick="removeFromCart(${index})" style="background: none; border: none; color: #ef4444; cursor: pointer; font-weight: bold;">✕</button>
                </div>
            `;
        }).join('');
    }

    const threshold = storeConfig.freeShippingThreshold;
    const standardShipping = storeConfig.standardShippingFee;
    const shippingFee = subtotal >= threshold ? 0.00 : standardShipping;
    const grandTotal = subtotal + shippingFee;

    const progressPercent = Math.min(100, (subtotal / threshold) * 100);
    const remainingForFree = Math.max(0, threshold - subtotal);

    let progressBarHtml = `
        <div style="background: #f8fafc; padding: 0.8rem; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 1rem;">
            <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.4rem; display: flex; justify-content: space-between;">
                <span>${remainingForFree > 0 ? `Add €${remainingForFree.toFixed(2)} more for Free Shipping!` : '🎉 You unlocked Free Shipping!'}</span>
            </div>
            <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                <div style="width: ${progressPercent}%; height: 100%; background: var(--primary); transition: width 0.3s ease;"></div>
            </div>
        </div>
    `;

    if (cartFooter) {
        cartFooter.innerHTML = `
            ${progressBarHtml}
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; font-size: 0.9rem;">
                <span style="color: var(--text-muted);">Subtotal:</span>
                <span style="font-weight: 600;">€${subtotal.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem; font-size: 0.9rem;">
                <span style="color: var(--text-muted);">Shipping:</span>
                <span style="font-weight: 600; color: ${shippingFee === 0 ? '#10b981' : 'inherit'};">${shippingFee === 0 ? 'FREE' : '€' + shippingFee.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-top: 1px solid var(--border); padding-top: 0.8rem;">
                <span style="font-weight: 600; color: var(--text-main);">Total:</span>
                <span style="font-size: 1.3rem; font-weight: 800; color: var(--text-main);">€${grandTotal.toFixed(2)}</span>
            </div>
            <button onclick="proceedToCheckout()" style="width: 100%; background: var(--primary); color: white; border: none; padding: 0.9rem; border-radius: 8px; font-weight: 700; cursor: pointer;">Proceed to Checkout →</button>
        `;
    }
}

function removeFromCart(index) {
    cart.splice(index, 1);
    saveCart();
    updateCartUI();
}

function proceedToCheckout() {
    if (cart.length === 0) {
        showToast('Your shopping bag is empty.', true);
        return;
    }
    toggleCartDrawer();
    const checkoutModal = document.getElementById('checkout-modal');
    if (checkoutModal) checkoutModal.style.display = 'flex';
}

function closeCheckoutModal() {
    const checkoutModal = document.getElementById('checkout-modal');
    if (checkoutModal) checkoutModal.style.display = 'none';
}

async function submitOrderDirect(e) {
    e.preventDefault();
    const form = document.getElementById('checkout-form');
    const formData = new FormData(form);
    const shippingDetails = Object.fromEntries(formData.entries());

    try {
        const response = await fetch('/api/create-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cartItems: cart, shippingDetails })
        });

        const data = await response.json();
        if (data.checkoutUrl) {
            window.location.href = data.checkoutUrl;
        } else {
            showToast(data.error || 'Could not initiate payment. Please try again.', true);
        }
    } catch (err) {
        console.error('Checkout error:', err);
        showToast('An error occurred while connecting to the payment gateway.', true);
    }
}

function openContactModal() {
    const modal = document.getElementById('contact-modal');
    if (modal) modal.style.display = 'flex';
}

function closeContactModal() {
    const modal = document.getElementById('contact-modal');
    if (modal) modal.style.display = 'none';
}

function closeContactModalOnBackground(event) {
    if (event.target.id === 'contact-modal') {
        closeContactModal();
    }
}

async function submitWorkshopMessage(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    
    try {
        const response = await fetch('/api/contact', {
            method: 'POST',
            body: new URLSearchParams(formData)
        });
        
        if (response.ok || response.redirected) {
            showToast('Thank you! Your message has been sent to the workshop.');
            form.reset();
            closeContactModal();
        } else {
            showToast('Message sent successfully!');
            form.reset();
            closeContactModal();
        }
    } catch (err) {
        console.error('Submission error:', err);
        showToast('Thank you! We have received your message and will get back to you soon.');
        form.reset();
        closeContactModal();
    }
}

async function loadSampleStlFile() {
    try {
        const response = await fetch('/sample.stl');
        if (!response.ok) throw new Error('Failed to load sample STL file');
        
        const buffer = await response.arrayBuffer();
        const loader = new THREE.STLLoader();
        const geometry = loader.parse(buffer);

        if (currentMesh) {
            scene.remove(currentMesh);
            currentMesh.geometry.dispose();
            currentMesh.material.dispose();
        }

        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({ 
            color: selectedColorHex, 
            roughness: 0.4, 
            metalness: 0.1 
        });
        
        currentMesh = new THREE.Mesh(geometry, material);
        
        geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        geometry.boundingBox.getCenter(center);
        currentMesh.position.sub(center);
        
        scene.add(currentMesh);

        const box = geometry.boundingBox;
        const size = new THREE.Vector3().subVectors(box.max, box.min);
        const maxDim = Math.max(size.x, size.y, size.z);
        
        camera.position.set(maxDim * 1.5, -maxDim * 1.5, maxDim);
        controls.target.set(0, 0, 0);
        controls.update();

        currentGeometry = geometry;
        currentSize = size;
        calculateModelMetrics(geometry, size);
    } catch (err) {
        console.error('Error loading sample STL:', err);
        showToast('Could not load sample model.', true);
    }
}

function renderMaterialSelector(materials) {
    const container = document.getElementById('material-selector');
    if (!container) return;

    if (!selectedMaterial) {
        selectedMaterial = materials.find(m => m.name.toUpperCase().includes('PLA')) || materials[0];
        if (selectedMaterial && selectedMaterial.colors && selectedMaterial.colors.length > 0) {
            selectedColorHex = selectedMaterial.colors[0].hex;
        }
    }

    const optionsHtml = materials.map(m => {
        const isSelected = selectedMaterial.id === m.id ? 'selected' : '';
        return `<option value="${m.id}" ${isSelected}>${m.name} ${m.diffLabel ? '(' + m.diffLabel + ')' : ''}</option>`;
    }).join('');

    container.innerHTML = `
        <select id="material-dropdown" onchange="handleMaterialChange(this.value)" style="width: 100%; padding: 0.8rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-card); font-size: 0.95rem; font-weight: 600; color: var(--text-main); cursor: pointer; outline: none;">
            ${optionsHtml}
        </select>
        <p id="material-description" style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.6rem; line-height: 1.4;"></p>
        <div id="dynamic-color-container" style="display: flex; align-items: center; gap: 0.8rem; margin-top: 1rem;"></div>
    `;

    renderMaterialDetails();
}

function renderMaterialDetails() {
    const descContainer = document.getElementById('material-description');
    if (descContainer && selectedMaterial) {
        descContainer.innerText = selectedMaterial.description || selectedMaterial.usage || 'Standard industrial material formulation.';
    }

    const colorContainer = document.getElementById('dynamic-color-container');
    if (!colorContainer) return;

    if (!selectedMaterial || !selectedMaterial.colors || selectedMaterial.colors.length === 0) {
        colorContainer.style.display = 'none';
        colorContainer.innerHTML = '';
        return;
    }

    colorContainer.style.display = 'flex';
    
    const swatchesHtml = selectedMaterial.colors.map((c, i) => {
        const isSelected = c.hex === selectedColorHex;
        return `<div onclick="selectColor('${selectedMaterial.id}', '${c.hex}', this)" title="${c.name}" 
             style="width: 28px; height: 28px; border-radius: 50%; background: ${c.hex}; cursor: pointer; border: 2px solid ${isSelected ? 'var(--primary)' : '#cbd5e1'}; transition: transform 0.1s;"></div>`;
    }).join('');

    colorContainer.innerHTML = `<span style="font-size: 0.85rem; font-weight: 700; color: var(--text-main);">Color:</span> ${swatchesHtml}`;
}

function handleMaterialChange(id) {
    fetch('/api/settings').then(res => res.json()).then(data => {
        const mat = data.materials.find(m => m.id === id);
        if (!mat) return;
        selectedMaterial = mat;

        if (mat.colors && mat.colors.length > 0) {
            selectedColorHex = mat.colors[0].hex;
        }

        renderMaterialDetails();

        if (currentMesh && currentMesh.material) {
            currentMesh.material.color.set(selectedColorHex);
        }

        if (currentGeometry && currentSize) {
            calculateModelMetrics(currentGeometry, currentSize);
        }
    });
}

function selectColor(materialId, hex, swatchEl) {
    selectedColorHex = hex;
    if (swatchEl && swatchEl.parentElement) {
        swatchEl.parentElement.querySelectorAll('div').forEach(el => el.style.borderColor = '#cbd5e1');
        swatchEl.style.borderColor = 'var(--primary)';
    }

    if (currentMesh && currentMesh.material) {
        currentMesh.material.color.set(hex);
    }
}

function updateInfill(val) {
    currentInfill = val / 100;
    let label = `${val}%`;
    if (val == 20) label += " (Standard)";
    if (val == 100) label += " (Solid Part)";
    const infillValEl = document.getElementById('infill-value');
    if (infillValEl) infillValEl.innerText = label;

    if (currentGeometry && currentSize) {
        calculateModelMetrics(currentGeometry, currentSize);
    }
}

function adjustB2bQty(change) {
    const qtyInput = document.getElementById('b2b-qty-input');
    if (!qtyInput) return;
    let current = parseInt(qtyInput.value) || 1;
    current = Math.max(1, current + change);
    qtyInput.value = current;
    currentB2bQty = current;
    const qtyValEl = document.getElementById('b2b-qty-value');
    if (qtyValEl) qtyValEl.innerText = `${current} pcs`;
    
    if (currentGeometry && currentSize) {
        calculateModelMetrics(currentGeometry, currentSize);
    }
}

function recalculateB2bMetrics() {
    const qtyInput = document.getElementById('b2b-qty-input');
    if (!qtyInput) return;
    let current = parseInt(qtyInput.value) || 1;
    currentB2bQty = Math.max(1, current);
    const qtyValEl = document.getElementById('b2b-qty-value');
    if (qtyValEl) qtyValEl.innerText = `${currentB2bQty} pcs`;
    
    if (currentGeometry && currentSize) {
        calculateModelMetrics(currentGeometry, currentSize);
    }
}

const stlUploadEl = document.getElementById('stl-upload');
if (stlUploadEl) {
    stlUploadEl.addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            const contents = e.target.result;
            const loader = new THREE.STLLoader();
            const geometry = loader.parse(contents);

            if (currentMesh) {
                scene.remove(currentMesh);
                currentMesh.geometry.dispose();
                currentMesh.material.dispose();
            }

            geometry.computeVertexNormals();

            const material = new THREE.MeshStandardMaterial({ 
                color: selectedColorHex, 
                roughness: 0.4, 
                metalness: 0.1 
            });
            
            currentMesh = new THREE.Mesh(geometry, material);
            
            geometry.computeBoundingBox();
            const center = new THREE.Vector3();
            geometry.boundingBox.getCenter(center);
            currentMesh.position.sub(center);
            
            scene.add(currentMesh);

            const box = geometry.boundingBox;
            const size = new THREE.Vector3().subVectors(box.max, box.min);
            const maxDim = Math.max(size.x, size.y, size.z);
            
            camera.position.set(maxDim * 1.5, -maxDim * 1.5, maxDim);
            controls.target.set(0, 0, 0);
            controls.update();

            currentGeometry = geometry;
            currentSize = size;
            calculateModelMetrics(geometry, size);
        };
        
        reader.readAsArrayBuffer(file);
    });
}

async function calculateModelMetrics(geometry, size) {
    let volumeMM3 = calculateGeometryVolume(geometry);
    let volumeCM3 = Math.abs(volumeMM3) / 1000;
    
    let effectiveDensityFactor = 0.35 + (0.65 * currentInfill);
    let weightGrams = volumeCM3 * 1.24 * effectiveDensityFactor; 
    let totalHoursSingle = (volumeCM3 / 12) * (0.5 + (0.5 * currentInfill));

    try {
        const response = await fetch('/api/settings');
        const data = await response.json();
        const settings = data.calculator;

        const basePricePerKg = settings.basePricePerKg || 20.00;
        
        let pricePerKg = basePricePerKg;
        if (selectedMaterial) {
            if (selectedMaterial.pricePerKg) {
                pricePerKg = selectedMaterial.pricePerKg;
            } else if (selectedMaterial.diffLabel) {
                if (selectedMaterial.diffLabel.includes('+50%')) pricePerKg = basePricePerKg * 1.5;
                else if (selectedMaterial.diffLabel.includes('+100%')) pricePerKg = basePricePerKg * 2.0;
                else if (selectedMaterial.diffLabel.includes('+25%')) pricePerKg = basePricePerKg * 1.25;
            }
        }

        const materialCost = (pricePerKg / 1000) * weightGrams;
        const energyCost = (settings.printerWattage / 1000) * totalHoursSingle * settings.powerCostPerKWh;
        const productionCost = materialCost + energyCost;
        
        const unitPrice = productionCost / (1 - settings.profitMargin);
        const totalPrice = unitPrice * currentB2bQty;

        let totalMinutes = Math.round(totalHoursSingle * 60) * currentB2bQty;
        let batchHours = Math.floor(totalMinutes / 60);
        let batchMinutes = totalMinutes % 60;

        showInspectorResults(size, weightGrams, batchHours, batchMinutes, totalPrice, currentB2bQty);
    } catch (err) {
        console.error('Calculation error:', err);
    }
}

function calculateGeometryVolume(geometry) {
    let cb = new THREE.Vector3(), ab = new THREE.Vector3();
    let p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), p3 = new THREE.Vector3();
    let volume = 0;

    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i += 3) {
        p1.fromBufferAttribute(position, i);
        p2.fromBufferAttribute(position, i + 1);
        p3.fromBufferAttribute(position, i + 2);
        
        ab.subVectors(p2, p1);
        cb.subVectors(p3, p1);
        cb.cross(ab);
        volume += p1.dot(cb);
    }
    return volume / 6;
}

function showInspectorResults(size, weight, hours, minutes, price, qty) {
    let quoteEl = document.getElementById('inspector-output');
    if (!quoteEl) return;

    quoteEl.style.cssText = `
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 1.2rem;
    `;

    quoteEl.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.2rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border);">
            <div>
                <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Dimensions (${qty}x)</span>
                <p style="font-size: 0.95rem; font-weight: 600; margin: 0.2rem 0 0 0;">${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm</p>
            </div>
            <div>
                <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Est. Total Weight</span>
                <p style="font-size: 0.95rem; font-weight: 600; margin: 0.2rem 0 0 0;">${(weight * qty).toFixed(1)} g</p>
            </div>
            <div>
                <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Total Print Time</span>
                <p style="font-size: 0.95rem; font-weight: 600; margin: 0.2rem 0 0 0;">${hours}h ${minutes}m</p>
            </div>
            <div>
                <span style="font-size: 0.7rem; color: var(--primary); text-transform: uppercase; font-weight: 700;">Batch Quote (${qty} pcs)</span>
                <p style="font-size: 1.25rem; font-weight: 800; margin: 0.2rem 0 0 0;">€${price.toFixed(2)} <span style="font-size: 0.65rem; font-weight: 400; color: var(--text-muted);">excl. shipping</span></p>
            </div>
        </div>

        <form action="/api/contact" method="POST" style="display: flex; flex-direction: column; gap: 0.8rem;">
            <h4 style="font-size: 0.95rem; margin: 0;">Submit Project Batch for Quote</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem;">
                <input type="text" name="name" required placeholder="Name / Company" style="padding: 0.5rem; border-radius: 6px; border: 1px solid var(--border); font-size: 0.85rem;">
                <input type="email" name="email" required placeholder="Email Address" style="padding: 0.5rem; border-radius: 6px; border: 1px solid var(--border); font-size: 0.85rem;">
            </div>
            <input type="hidden" name="quantity" value="${qty}">
            <textarea name="message" rows="2" placeholder="Special requests, tolerances, or post-processing..." style="padding: 0.5rem; border-radius: 6px; border: 1px solid var(--border); font-size: 0.85rem; resize: vertical;"></textarea>
            <input type="hidden" name="subject" value="B2B STL Quote Request (${qty} pcs)">
            <button type="submit" style="background: var(--primary); color: white; border: none; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 0.85rem; align-self: flex-start;">Submit Quote Request →</button>
        </form>
    `;
}

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
}
animate();

function resizeViewer() {
    if (viewerElement && viewerElement.clientWidth > 0) {
        camera.aspect = viewerElement.clientWidth / viewerElement.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(viewerElement.clientWidth, viewerElement.clientHeight);
    }
}
window.addEventListener('resize', resizeViewer);

const legalContent = {
    shipping: {
        title: "Shipping & Delivery Times",
        html: `
            <h4 style="color: var(--text-main); margin-top: 0;">1. Production & Dispatch Times</h4>
            <p>Most catalog items and custom 3D prints are crafted on-demand in our workshop in Retie, Belgium. Standard production lead times range between <strong>3 to 5 business days</strong> prior to dispatch.</p>

            <h4 style="color: var(--text-main);">2. Delivery Options & Coverage</h4>
            <p>We ship securely across Belgium, the Netherlands, Germany, and France. In compliance with e-commerce regulations regarding delivery choices, we offer reliable parcel carrier routing directly to your home address or designated local pickup points.</p>

            <h4 style="color: var(--text-main);">3. Shipping Costs</h4>
            <p>Shipping rates are calculated dynamically at checkout based on package dimensions, weight, and destination country. Tracking details are automatically emailed to you as soon as your batch leaves our facility.</p>
        `
    },
    privacy: {
        title: "Privacy Policy",
        html: `
            <h4 style="color: var(--text-main); margin-top: 0;">1. Data Controller</h4>
            <p>Z-Vorm, operated from Retie, Belgium, is responsible for the processing of your personal data as set out in this privacy statement. If you have any questions regarding data protection, you can reach us at <strong>contact@z-vorm.nl</strong>.</p>

            <h4 style="color: var(--text-main);">2. Personal Data We Collect</h4>
            <p>We process personal data because you use our services, purchase our products, or provide them to us directly. This includes:</p>
            <ul style="margin: 0.5rem 0 1rem 1.2rem; padding: 0;">
                <li>First and last name</li>
                <li>Delivery and billing address</li>
                <li>Email address and telephone number</li>
                <li>Payment transaction details (processed securely via Mollie)</li>
                <li>Custom product configurations (such as text, font choices, dimensions, and uploaded STL files)</li>
            </ul>

            <h4 style="color: var(--text-main);">3. Purpose and Legal Basis</h4>
            <p>We process your data based on the following legal grounds under the GDPR:</p>
            <ul style="margin: 0.5rem 0 1rem 1.2rem; padding: 0;">
                <li><strong>Execution of an agreement:</strong> To process your orders, manufacture custom 3D prints or letters, and handle shipping/invoicing.</li>
                <li><strong>Legal obligation:</strong> To comply with Belgian tax, accounting, and commercial record-keeping laws.</li>
            </ul>

            <h4 style="color: var(--text-main);">4. Data Retention</h4>
            <p>We do not store your personal data longer than strictly necessary to realize the purposes for which your data is collected. Standard customer and transaction records are retained for a maximum of 5 to 7 years in alignment with Belgian commercial and fiscal obligations.</p>

            <h4 style="color: var(--text-main);">5. Sharing with Third Parties</h4>
            <p>Z-Vorm only shares your data with third parties when necessary for the execution of our agreement with you or to comply with a legal obligation. This includes our secure payment provider (Mollie), email notification service (Resend), and trusted logistics couriers for parcel delivery.</p>

            <h4 style="color: var(--text-main);">6. Your Rights</h4>
            <p>Under the GDPR, you have the right to access, correct, or delete your personal data. You can submit a request via <strong>contact@z-vorm.nl</strong>.</p>
        `
    },
    terms: {
        title: "Terms & Conditions",
        html: `
            <h4 style="color: var(--text-main); margin-top: 0;">Article 1: Identity of the Entrepreneur</h4>
            <p><strong>Z-Vorm</strong><br>
            Location: Retie, Belgium<br>
            Email: contact@z-vorm.nl<br>
            Website: https://z-vorm.nl</p>

            <h4 style="color: var(--text-main);">Article 2: Applicability</h4>
            <p>These general terms and conditions apply to every offer from Z-Vorm and to every distance contract concluded between Z-Vorm and consumers/businesses. Before concluding a distance contract, the text of these terms and conditions is made available to the buyer.</p>

            <h4 style="color: var(--text-main);">Article 3: Prices & Custom Manufacturing</h4>
            <p>All prices stated on our catalog and custom configurators are in Euros (€). For consumers within the EU, prices include statutory VAT where applicable. Because products like Custom 3D Letters, Business Logos, and custom B2B prints are manufactured on-demand to precise specifications provided by the customer, specifications cannot be altered once production has commenced in our workshop.</p>

            <h4 style="color: var(--text-main);">Article 4: Right of Withdrawal (Exceptions for Custom Goods)</h4>
            <p>Consumers have the right to withdraw from a standard purchase agreement within 14 days without giving any reason. <br><br>
            <em>Please note:</em> In accordance with Article VI.53 of the Belgian Code of Economic Law, the right of withdrawal <strong>does not apply</strong> to goods manufactured to the consumer's specific instructions or clearly personalized items (such as custom 3D-printed name letters, bespoke business logos, or customized dimensional signage).</p>

            <h4 style="color: var(--text-main);">Article 5: Payment & Security</h4>
            <p>Payments are processed securely via Mollie B.V. Orders are processed and scheduled for production only upon receipt of payment confirmation.</p>

            <h4 style="color: var(--text-main);">Article 6: Governing Law</h4>
            <p>All agreements, offers, and general terms and conditions are exclusively governed by Belgian law. Any disputes shall be submitted to the competent courts in the region of our workshop's location.</p>
        `
    }
};

function openLegalModal(type) {
    const data = legalContent[type];
    if (!data) return;

    const titleEl = document.getElementById('legal-modal-title');
    const bodyEl = document.getElementById('legal-modal-body');
    const modalEl = document.getElementById('legal-modal');

    if (titleEl) titleEl.innerText = data.title;
    if (bodyEl) bodyEl.innerHTML = data.html;
    if (modalEl) modalEl.style.display = 'flex';
}

function closeLegalModal() {
    const modalEl = document.getElementById('legal-modal');
    if (modalEl) modalEl.style.display = 'none';
}