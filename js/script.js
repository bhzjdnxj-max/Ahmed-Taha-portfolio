document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const mainView = document.getElementById('main-view');
    const galleryView = document.getElementById('gallery-view');
    const categoryBtns = document.querySelectorAll('.category-btn');
    const backBtn = document.getElementById('back-btn');
    const galleryTitle = document.getElementById('gallery-title');
    const galleryGrid = document.getElementById('gallery-grid');
    const galleryEmpty = document.getElementById('gallery-empty');
    
    // Lightbox Elements
    const lightbox = document.getElementById('lightbox');
    const lightboxCloseBtn = document.getElementById('lightbox-close');
    const lightboxMediaContainer = document.getElementById('lightbox-media-container');
    const lightboxTitle = document.getElementById('lightbox-title');
    const lightboxDesc = document.getElementById('lightbox-desc');
    const lightboxLink = document.getElementById('lightbox-link');

    let allProjects = [];
    let isDataLoaded = false;
    let isLoading = false;

    // --- Year for Footer ---
    document.getElementById('year').textContent = new Date().getFullYear();

    // --- Navigation ---
    categoryBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const category = btn.getAttribute('data-category');
            openCategory(category);
        });
    });

    backBtn.addEventListener('click', () => {
        galleryView.classList.remove('active');
        setTimeout(() => {
            mainView.classList.add('active');
            window.scrollTo(0, 0);
        }, 300); // Wait for fade out
    });

    // --- Supabase Data Fetching ---
    async function fetchProjects() {
        if (!window.supabaseClient) {
            console.warn("Supabase unavailable — displaying portfolio without dynamic projects.");
            return [];
        }

        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Supabase request timeout')), 5000)
        );

        try {
            const fetchPromise = window.supabaseClient
                .from('projects')
                .select('*')
                .eq('published', true)
                .order('created_at', { ascending: false });

            // Race against the 5-second timeout
            const response = await Promise.race([fetchPromise, timeoutPromise]);

            if (response.error) throw response.error;
            return response.data || [];
        } catch (error) {
            console.error("Error fetching projects:", error.message);
            return [];
        }
    }

    async function fetchProfilePhoto() {
        if (!window.supabaseClient) return;

        try {
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('timeout')), 3000)
            );

            const fetchPromise = window.supabaseClient
                .from('settings')
                .select('profile_photo_url')
                .eq('id', 1)
                .single();

            const response = await Promise.race([fetchPromise, timeoutPromise]);
            
            if (response.data && response.data.profile_photo_url) {
                const profileImg = document.getElementById('profile-img');
                if (profileImg) {
                    profileImg.src = response.data.profile_photo_url;
                }
            }
        } catch (error) {
            // Silently fail to keep placeholder if error
            console.warn("Could not load profile photo from Supabase", error.message);
        }
    }

    async function loadDataIfNeeded() {
        if (isDataLoaded || isLoading) return;
        isLoading = true;
        try {
            // Load projects, profile photo, and clients in parallel
            const [projectsData] = await Promise.all([
                fetchProjects(),
                fetchProfilePhoto(),
                renderClients()
            ]);
            allProjects = projectsData;
            isDataLoaded = true;
        } finally {
            isLoading = false;
        }
    }

    // Load data asynchronously in the background soon after initial render
    setTimeout(loadDataIfNeeded, 500);

    // --- Category View Management ---
    async function openCategory(category) {
        // Switch Views
        mainView.classList.remove('active');
        
        // Ensure data is loaded
        if (!isDataLoaded) {
            // Show a simple inline loading indication if we are still fetching
            galleryGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary);">Loading...</div>';
            galleryEmpty.style.display = 'none';
            await loadDataIfNeeded();
        }

        setTimeout(() => {
            galleryTitle.textContent = category.toUpperCase();
            
            renderGallery(category);
            
            galleryView.classList.add('active');
            window.scrollTo(0, 0);
        }, 300);
    }

    function renderGallery(category) {
        galleryGrid.innerHTML = '';
        
        const filteredProjects = allProjects.filter(p => p.category === category);

        if (filteredProjects.length === 0) {
            galleryEmpty.style.display = 'block';
            return;
        }

        galleryEmpty.style.display = 'none';

        filteredProjects.forEach((project, index) => {
            const card = document.createElement('div');
            card.className = 'project-card';
            // Make every 3rd or 4th item wide for masonry-like visual interest
            if (index % 4 === 0 && project.type === 'video') {
                card.classList.add('wide');
            }

            let mediaElement = '';
            if (project.type === 'video') {
                mediaElement = `<video src="${project.media_url}" muted loop playsinline onmouseover="this.play()" onmouseout="this.pause()">Your browser does not support this video format. <a href="${project.media_url}" target="_blank">Download</a></video>`;
            } else {
                mediaElement = `<img src="${project.media_url}" alt="${project.title || 'Project'}" loading="lazy">`;
            }

            card.innerHTML = `
                ${mediaElement}
                <div class="project-overlay">
                    <h3 class="project-card-title">${project.title || 'Untitled'}</h3>
                    <span class="project-card-type">${project.type}</span>
                </div>
            `;

            card.addEventListener('click', () => openLightbox(project));
            galleryGrid.appendChild(card);
        });
    }

    async function renderClients() {
        const mainClientsGrid = document.getElementById('main-clients-grid');
        const mainClientsEmpty = document.getElementById('main-clients-empty');
        if (!mainClientsGrid) return;
        
        mainClientsGrid.innerHTML = '';
        if (!window.supabaseClient) {
            mainClientsEmpty.style.display = 'block';
            return;
        }

        try {
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Supabase request timeout')), 5000)
            );

            const fetchPromise = window.supabaseClient
                .from('clients')
                .select('*')
                .eq('published', true)
                .order('created_at', { ascending: false });

            const response = await Promise.race([fetchPromise, timeoutPromise]);

            if (response.error || !response.data || response.data.length === 0) {
                mainClientsEmpty.style.display = 'block';
                return;
            }

            mainClientsEmpty.style.display = 'none';

            response.data.forEach(client => {
                // Outer wrapper: image on top, name below
                const wrapper = document.createElement('div');
                wrapper.className = 'client-card-wrapper';
                wrapper.style.display = 'flex';
                wrapper.style.flexDirection = 'column';
                wrapper.style.alignItems = 'center';
                wrapper.style.gap = '0.75rem';

                // Image card
                const card = document.createElement('div');
                card.className = 'client-logo-card';
                card.style.display = 'flex';
                card.style.alignItems = 'center';
                card.style.justifyContent = 'center';
                card.style.width = '100%';
                card.style.aspectRatio = '4/5';
                card.style.border = '1px solid rgba(255, 255, 255, 0.05)';
                card.style.background = 'rgba(0, 0, 0, 0.2)';
                card.style.transition = 'all 0.3s ease';
                card.style.overflow = 'hidden';

                let logoHtml = client.logo_url 
                    ? `<img src="${client.logo_url}" alt="${client.name}" style="width: 100%; height: 100%; object-fit: cover; filter: grayscale(100%) opacity(0.8); transition: all 0.5s ease;" onmouseover="this.style.filter='grayscale(0%) opacity(1)'; this.style.transform='scale(1.05)';" onmouseout="this.style.filter='grayscale(100%) opacity(0.8)'; this.style.transform='scale(1)';">`
                    : `<h3 style="font-family: var(--font-display); color: rgba(255,255,255,0.7); font-size: 1.5rem; text-transform: uppercase;">${client.name}</h3>`;

                card.innerHTML = logoHtml;

                // Name label below image
                const nameLabel = document.createElement('p');
                nameLabel.textContent = client.name || '';
                nameLabel.style.fontFamily = 'var(--font-display)';
                nameLabel.style.fontSize = '0.85rem';
                nameLabel.style.fontWeight = '500';
                nameLabel.style.letterSpacing = '0.12em';
                nameLabel.style.textTransform = 'uppercase';
                nameLabel.style.color = 'rgba(255, 255, 255, 0.75)';
                nameLabel.style.textAlign = 'center';

                wrapper.appendChild(card);
                wrapper.appendChild(nameLabel);

                if (client.website_link) {
                    wrapper.style.cursor = 'pointer';
                    wrapper.addEventListener('click', () => {
                        window.open(client.website_link, '_blank');
                    });
                    card.addEventListener('mouseover', () => { card.style.background = 'rgba(255, 255, 255, 0.05)'; });
                    card.addEventListener('mouseout', () => { card.style.background = 'rgba(0, 0, 0, 0.2)'; });
                }
                
                mainClientsGrid.appendChild(wrapper);
            });
        } catch (error) {
            console.error("Error fetching clients:", error.message);
            mainClientsEmpty.style.display = 'block';
        }
    }


    // --- Lightbox Management ---
    function openLightbox(project) {
        lightboxMediaContainer.innerHTML = '';
        
        if (project.type === 'video') {
            lightboxMediaContainer.innerHTML = `<video src="${project.media_url}" controls autoplay playsinline>Your browser does not support this video format. <a href="${project.media_url}" target="_blank" style="color:#3b82f6;">Download</a></video>`;
        } else {
            lightboxMediaContainer.innerHTML = `<img src="${project.media_url}" alt="${project.title}">`;
        }

        lightboxTitle.textContent = project.title || 'Untitled';
        lightboxDesc.textContent = project.description || '';
        
        if (project.project_link) {
            lightboxLink.href = project.project_link;
            lightboxLink.style.display = 'inline-block';
        } else {
            lightboxLink.style.display = 'none';
        }

        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }

    function closeLightbox() {
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
        // Clear media to stop video playback
        setTimeout(() => {
            lightboxMediaContainer.innerHTML = '';
        }, 300);
    }

    lightboxCloseBtn.addEventListener('click', closeLightbox);
    
    // Close on click outside
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox || e.target.classList.contains('lightbox-content-wrapper')) {
            closeLightbox();
        }
    });

    // Close on ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightbox.classList.contains('active')) {
            closeLightbox();
        }
    });
});
