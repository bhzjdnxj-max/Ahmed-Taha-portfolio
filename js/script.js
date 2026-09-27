// ============================================================
// VIDEO DIAGNOSTIC
// ============================================================

window.diagnoseVideoError = async function (videoElement, url, mimeType) {

    console.group(`Video Diagnostic: ${url}`);

    const canPlay = videoElement.canPlayType(mimeType);

    console.log(
        `Browser canPlayType('${mimeType}'):`,
        canPlay || 'No'
    );

    try {

        const response = await fetch(url, {
            method: 'HEAD'
        });

        console.log(
            'Supabase Content-Type:',
            response.headers.get('content-type')
        );

    } catch (e) {

        console.log(
            'Could not check video:',
            e.message
        );
    }

    if (videoElement.error) {

        const errorCodes = {
            1: 'MEDIA_ERR_ABORTED',
            2: 'MEDIA_ERR_NETWORK',
            3: 'MEDIA_ERR_DECODE',
            4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
        };

        console.error(
            'Video Error:',
            errorCodes[videoElement.error.code] || 'UNKNOWN'
        );
    }

    console.groupEnd();
};


// ============================================================
// MAIN APP
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

    // ========================================================
    // ELEMENTS
    // ========================================================

    const mainView =
        document.getElementById('main-view');

    const galleryView =
        document.getElementById('gallery-view');

    const categoryBtns =
        document.querySelectorAll('.category-btn');

    const backBtn =
        document.getElementById('back-btn');

    const galleryTitle =
        document.getElementById('gallery-title');

    const galleryGrid =
        document.getElementById('gallery-grid');

    const galleryEmpty =
        document.getElementById('gallery-empty');

    // ========================================================
    // LIGHTBOX
    // ========================================================

    const lightbox =
        document.getElementById('lightbox');

    const lightboxCloseBtn =
        document.getElementById('lightbox-close');

    const lightboxMediaContainer =
        document.getElementById(
            'lightbox-media-container'
        );

    const lightboxTitle =
        document.getElementById('lightbox-title');

    const lightboxDesc =
        document.getElementById('lightbox-desc');

    const lightboxLink =
        document.getElementById('lightbox-link');


    // ========================================================
    // STATE
    // ========================================================

    let allProjects = [];

    let isDataLoaded = false;

    let isLoading = false;


    // ========================================================
    // YEAR
    // ========================================================

    const yearElement =
        document.getElementById('year');

    if (yearElement) {

        yearElement.textContent =
            new Date().getFullYear();
    }


    // ========================================================
    // NAVIGATION
    // ========================================================

    categoryBtns.forEach(btn => {

        btn.addEventListener('click', () => {

            const category =
                btn.getAttribute('data-category');

            openCategory(category);
        });

    });


    if (backBtn) {

        backBtn.addEventListener('click', () => {

            galleryView.classList.remove('active');

            setTimeout(() => {

                mainView.classList.add('active');

                window.scrollTo(0, 0);

            }, 300);

        });

    }


    // ========================================================
    // FETCH PROJECTS
    // ========================================================

    async function fetchProjects() {

        if (!window.supabaseClient) {

            console.warn(
                'Supabase unavailable.'
            );

            return [];
        }

        const timeoutPromise =
            new Promise((_, reject) => {

                setTimeout(
                    () => reject(
                        new Error(
                            'Supabase request timeout'
                        )
                    ),
                    5000
                );

            });


        try {

            const fetchPromise =
                window.supabaseClient
                    .from('projects')
                    .select('*')
                    .eq('published', true)
                    .order(
                        'created_at',
                        {
                            ascending: false
                        }
                    );


            const response =
                await Promise.race([
                    fetchPromise,
                    timeoutPromise
                ]);


            if (response.error) {
                throw response.error;
            }


            return response.data || [];


        } catch (error) {

            console.error(
                'Error fetching projects:',
                error.message
            );

            return [];
        }
    }


    // ========================================================
    // PROFILE PHOTO
    // ========================================================

    async function fetchProfilePhoto() {

        if (!window.supabaseClient) {
            return;
        }


        try {

            const timeoutPromise =
                new Promise((_, reject) => {

                    setTimeout(
                        () => reject(
                            new Error('timeout')
                        ),
                        3000
                    );

                });


            const fetchPromise =
                window.supabaseClient
                    .from('settings')
                    .select('profile_photo_url')
                    .eq('id', 1)
                    .single();


            const response =
                await Promise.race([
                    fetchPromise,
                    timeoutPromise
                ]);


            if (
                response.data &&
                response.data.profile_photo_url
            ) {

                const profileImg =
                    document.getElementById(
                        'profile-img'
                    );


                if (profileImg) {

                    profileImg.src =
                        response.data.profile_photo_url;
                }
            }


        } catch (error) {

            console.warn(
                'Could not load profile photo:',
                error.message
            );
        }
    }


    // ========================================================
    // LOAD ALL DATA
    // ========================================================

    async function loadDataIfNeeded() {

        if (
            isDataLoaded ||
            isLoading
        ) {
            return;
        }


        isLoading = true;


        try {

            const results =
                await Promise.all([

                    fetchProjects(),

                    fetchProfilePhoto(),

                    renderClients()

                ]);


            allProjects =
                results[0] || [];


            isDataLoaded = true;


        } finally {

            isLoading = false;
        }
    }


    // ========================================================
    // INITIAL DATA LOAD
    // ========================================================

    setTimeout(
        loadDataIfNeeded,
        500
    );


    // ========================================================
    // OPEN CATEGORY
    // ========================================================

    async function openCategory(category) {

        mainView.classList.remove('active');


        if (!isDataLoaded) {

            galleryGrid.innerHTML = `
                <div style="
                    grid-column:1/-1;
                    text-align:center;
                    color:var(--text-secondary);
                    padding:3rem;
                ">
                    Loading...
                </div>
            `;


            galleryEmpty.style.display =
                'none';


            await loadDataIfNeeded();
        }


        setTimeout(() => {

            galleryTitle.textContent =
                category.toUpperCase();


            renderGallery(category);


            galleryView.classList.add(
                'active'
            );


            window.scrollTo(
                0,
                0
            );

        }, 300);
    }


    // ========================================================
    // GET PUBLIC MEDIA URL
    // ========================================================

    function getMediaUrl(url) {

        if (!url) {
            return '';
        }


        if (
            url.startsWith('http://') ||
            url.startsWith('https://')
        ) {

            return url;
        }


        if (window.supabaseClient) {

            return window.supabaseClient
                .storage
                .from('portfolio-media')
                .getPublicUrl(url)
                .data
                .publicUrl;
        }


        return url;
    }


    // ========================================================
    // GET VIDEO MIME TYPE
    // ========================================================

    function getVideoMime(url) {

        const ext =
            url
                .split('.')
                .pop()
                .split('?')[0]
                .toLowerCase();


        const mimeMap = {

            mp4: 'video/mp4',

            mov: 'video/quicktime',

            webm: 'video/webm',

            m4v: 'video/mp4',

            mkv: 'video/mp4',

            avi: 'video/mp4'

        };


        return (
            mimeMap[ext] ||
            'video/mp4'
        );
    }


    // ========================================================
    // RENDER GALLERY
    // ========================================================

    function renderGallery(category) {

        galleryGrid.innerHTML = '';


        const filteredProjects =
            allProjects.filter(
                project =>
                    project.category === category
            );


        if (
            filteredProjects.length === 0
        ) {

            galleryEmpty.style.display =
                'block';

            return;
        }


        galleryEmpty.style.display =
            'none';


        filteredProjects.forEach(
            (project, index) => {

                const card =
                    document.createElement(
                        'div'
                    );


                card.className =
                    'project-card';


                if (
                    index % 4 === 0 &&
                    project.type === 'video'
                ) {

                    card.classList.add(
                        'wide'
                    );
                }


                let mediaElement = '';


                if (project.media_url) {

                    const finalMediaUrl =
                        getMediaUrl(
                            project.media_url
                        );


                    // =================================================
                    // VIDEO
                    // =================================================

                    if (
                        project.type === 'video'
                    ) {

                        const mimeType =
                            getVideoMime(
                                finalMediaUrl
                            );


                        mediaElement = `

                            <video
                                class="gallery-video"
                                muted
                                autoplay
                                loop
                                playsinline
                                webkit-playsinline
                                preload="auto"
                                disablepictureinpicture
                                data-video-url="${finalMediaUrl}"
                                data-video-mime="${mimeType}"
                                aria-label="${project.title || 'Project video'}"
                            >

                                <source
                                    src="${finalMediaUrl}"
                                    type="${mimeType}"
                                >

                            </video>

                        `;

                    }

                    // =================================================
                    // IMAGE
                    // =================================================

                    else {

                        mediaElement = `

                            <img
                                src="${finalMediaUrl}"
                                alt="${project.title || 'Project'}"
                                loading="lazy"
                            >

                        `;
                    }


                } else {

                    mediaElement = `

                        <div style="
                            width:100%;
                            height:100%;
                            display:flex;
                            align-items:center;
                            justify-content:center;
                            opacity:0.1;
                        ">

                            <i
                                class="fa-solid fa-image fa-3x"
                            ></i>

                        </div>

                    `;
                }


                card.innerHTML = `

                    ${mediaElement}

                    <div class="project-overlay">

                        <h3 class="project-card-title">
                            ${project.title || 'Untitled'}
                        </h3>

                        <span class="project-card-type">
                            ${project.type || ''}
                        </span>

                    </div>

                `;


                card.addEventListener(
                    'click',
                    () => {

                        openLightbox(
                            project
                        );

                    }
                );


                galleryGrid.appendChild(
                    card
                );

            }
        );


        // ========================================================
        // IMPORTANT:
        // START VIDEO PREVIEWS ON MOBILE + DESKTOP
        // ========================================================

        setupGalleryVideoPreviews();
    }


    // ========================================================
    // MOBILE / DESKTOP VIDEO PREVIEWS
    // ========================================================

    function setupGalleryVideoPreviews() {

        const videos =
            galleryGrid.querySelectorAll(
                'video.gallery-video'
            );


        if (!videos.length) {
            return;
        }


        // ======================================================
        // FIRST ATTEMPT
        // ======================================================

        videos.forEach(video => {

            video.muted = true;

            video.defaultMuted = true;

            video.playsInline = true;


            const playPromise =
                video.play();


            if (
                playPromise !== undefined
            ) {

                playPromise.catch(() => {
                    // Browser may wait until video becomes visible.
                });
            }


            // If the video cannot load,
            // show a diagnostic in console.

            video.addEventListener(
                'error',
                () => {

                    console.warn(
                        'Gallery video failed:',
                        video.dataset.videoUrl
                    );

                },
                {
                    once: true
                }
            );

        });


        // ======================================================
        // INTERSECTION OBSERVER
        // ======================================================

        if (
            'IntersectionObserver'
            in window
        ) {

            const observer =
                new IntersectionObserver(
                    entries => {

                        entries.forEach(
                            entry => {

                                const video =
                                    entry.target;


                                if (
                                    entry.isIntersecting &&
                                    entry.intersectionRatio >= 0.15
                                ) {

                                    video.muted =
                                        true;


                                    video.defaultMuted =
                                        true;


                                    const playPromise =
                                        video.play();


                                    if (
                                        playPromise !==
                                        undefined
                                    ) {

                                        playPromise.catch(
                                            () => { }
                                        );
                                    }


                                } else {

                                    video.pause();

                                }

                            }
                        );

                    },
                    {
                        threshold: [
                            0,
                            0.15,
                            0.5
                        ],

                        rootMargin:
                            '150px 0px 150px 0px'
                    }
                );


            videos.forEach(video => {

                observer.observe(
                    video
                );

            });


        } else {

            // ==================================================
            // FALLBACK FOR OLDER BROWSERS
            // ==================================================

            videos.forEach(video => {

                video.muted =
                    true;

                const playPromise =
                    video.play();


                if (
                    playPromise !==
                    undefined
                ) {

                    playPromise.catch(
                        () => { }
                    );
                }

            });
        }
    }


    // ========================================================
    // CLIENTS
    // ========================================================

    async function renderClients() {

        const mainClientsGrid =
            document.getElementById(
                'main-clients-grid'
            );


        const mainClientsEmpty =
            document.getElementById(
                'main-clients-empty'
            );


        if (!mainClientsGrid) {
            return;
        }


        mainClientsGrid.innerHTML =
            '';


        if (!window.supabaseClient) {

            if (mainClientsEmpty) {

                mainClientsEmpty.style.display =
                    'block';
            }

            return;
        }


        try {

            const timeoutPromise =
                new Promise((_, reject) => {

                    setTimeout(
                        () => reject(
                            new Error(
                                'Supabase request timeout'
                            )
                        ),
                        5000
                    );

                });


            const fetchPromise =
                window.supabaseClient
                    .from('clients')
                    .select('*')
                    .eq('published', true)
                    .order(
                        'created_at',
                        {
                            ascending: false
                        }
                    );


            const response =
                await Promise.race([
                    fetchPromise,
                    timeoutPromise
                ]);


            if (
                response.error ||
                !response.data ||
                response.data.length === 0
            ) {

                if (mainClientsEmpty) {

                    mainClientsEmpty.style.display =
                        'block';
                }

                return;
            }


            if (mainClientsEmpty) {

                mainClientsEmpty.style.display =
                    'none';
            }


            response.data.forEach(
                client => {

                    const wrapper =
                        document.createElement(
                            'div'
                        );


                    wrapper.className =
                        'client-card-wrapper';


                    wrapper.style.display =
                        'flex';

                    wrapper.style.flexDirection =
                        'column';

                    wrapper.style.alignItems =
                        'center';

                    wrapper.style.gap =
                        '0.75rem';


                    const card =
                        document.createElement(
                            'div'
                        );


                    card.className =
                        'client-logo-card';


                    card.style.display =
                        'flex';

                    card.style.alignItems =
                        'center';

                    card.style.justifyContent =
                        'center';

                    card.style.width =
                        '100%';

                    card.style.aspectRatio =
                        '4/5';

                    card.style.border =
                        '1px solid rgba(255,255,255,0.05)';

                    card.style.background =
                        'rgba(0,0,0,0.2)';

                    card.style.transition =
                        'all 0.3s ease';

                    card.style.overflow =
                        'hidden';


                    let logoHtml;


                    if (client.logo_url) {

                        logoHtml = `

                            <img
                                src="${client.logo_url}"
                                alt="${client.name || ''}"
                                style="
                                    width:100%;
                                    height:100%;
                                    object-fit:cover;
                                    filter:grayscale(100%) opacity(0.8);
                                    transition:all 0.5s ease;
                                "
                            >

                        `;

                    } else {

                        logoHtml = `

                            <h3 style="
                                font-family:var(--font-display);
                                color:rgba(255,255,255,0.7);
                                font-size:1.5rem;
                                text-transform:uppercase;
                            ">

                                ${client.name || ''}

                            </h3>

                        `;
                    }


                    card.innerHTML =
                        logoHtml;


                    const nameLabel =
                        document.createElement(
                            'p'
                        );


                    nameLabel.textContent =
                        client.name || '';


                    nameLabel.style.fontFamily =
                        'var(--font-display)';

                    nameLabel.style.fontSize =
                        '0.85rem';

                    nameLabel.style.fontWeight =
                        '500';

                    nameLabel.style.letterSpacing =
                        '0.12em';

                    nameLabel.style.textTransform =
                        'uppercase';

                    nameLabel.style.color =
                        'rgba(255,255,255,0.75)';

                    nameLabel.style.textAlign =
                        'center';


                    wrapper.appendChild(
                        card
                    );

                    wrapper.appendChild(
                        nameLabel
                    );


                    if (
                        client.website_link
                    ) {

                        wrapper.style.cursor =
                            'pointer';


                        wrapper.addEventListener(
                            'click',
                            () => {

                                window.open(
                                    client.website_link,
                                    '_blank'
                                );

                            }
                        );


                        card.addEventListener(
                            'mouseenter',
                            () => {

                                card.style.background =
                                    'rgba(255,255,255,0.05)';

                            }
                        );


                        card.addEventListener(
                            'mouseleave',
                            () => {

                                card.style.background =
                                    'rgba(0,0,0,0.2)';

                            }
                        );
                    }


                    mainClientsGrid.appendChild(
                        wrapper
                    );

                }
            );


        } catch (error) {

            console.error(
                'Error fetching clients:',
                error.message
            );


            if (mainClientsEmpty) {

                mainClientsEmpty.style.display =
                    'block';
            }
        }
    }


    // ========================================================
    // LIGHTBOX
    // ========================================================

    function openLightbox(project) {

        lightboxMediaContainer.innerHTML =
            '';


        if (project.media_url) {

            const finalMediaUrl =
                getMediaUrl(
                    project.media_url
                );


            // ==================================================
            // VIDEO LIGHTBOX
            // ==================================================

            if (
                project.type === 'video'
            ) {

                const mimeType =
                    getVideoMime(
                        finalMediaUrl
                    );


                const video =
                    document.createElement(
                        'video'
                    );


                video.controls =
                    true;

                video.autoplay =
                    true;

                video.playsInline =
                    true;

                video.preload =
                    'metadata';

                video.style.maxWidth =
                    '100%';

                video.style.maxHeight =
                    '80vh';


                const source =
                    document.createElement(
                        'source'
                    );


                source.src =
                    finalMediaUrl;

                source.type =
                    mimeType;


                video.appendChild(
                    source
                );


                video.addEventListener(
                    'error',
                    () => {

                        window.diagnoseVideoError(
                            video,
                            finalMediaUrl,
                            mimeType
                        );

                    }
                );


                lightboxMediaContainer.appendChild(
                    video
                );


            }

            // ==================================================
            // IMAGE LIGHTBOX
            // ==================================================

            else {

                const img =
                    document.createElement(
                        'img'
                    );


                img.src =
                    finalMediaUrl;

                img.alt =
                    project.title ||
                    'Project';


                lightboxMediaContainer.appendChild(
                    img
                );
            }


        } else {

            lightboxMediaContainer.innerHTML = `

                <div style="
                    padding:4rem;
                    text-align:center;
                    color:var(--text-secondary);
                ">

                    <i
                        class="fa-solid fa-image fa-4x"
                        style="opacity:0.2;"
                    ></i>

                </div>

            `;
        }


        // ======================================================
        // LIGHTBOX TEXT
        // ======================================================

        lightboxTitle.textContent =
            project.title ||
            'Untitled';


        lightboxDesc.textContent =
            project.description ||
            '';


        if (
            project.project_link
        ) {

            lightboxLink.href =
                project.project_link;

            lightboxLink.style.display =
                'inline-block';

        } else {

            lightboxLink.style.display =
                'none';
        }


        // ======================================================
        // SHOW LIGHTBOX
        // ======================================================

        lightbox.classList.add(
            'active'
        );


        document.body.style.overflow =
            'hidden';
    }


    // ========================================================
    // CLOSE LIGHTBOX
    // ========================================================

    function closeLightbox() {

        lightbox.classList.remove(
            'active'
        );


        document.body.style.overflow =
            '';


        setTimeout(() => {

            lightboxMediaContainer.innerHTML =
                '';

        }, 300);
    }


    // ========================================================
    // CLOSE BUTTON
    // ========================================================

    if (lightboxCloseBtn) {

        lightboxCloseBtn.addEventListener(
            'click',
            closeLightbox
        );
    }


    // ========================================================
    // CLICK OUTSIDE LIGHTBOX
    // ========================================================

    if (lightbox) {

        lightbox.addEventListener(
            'click',
            e => {

                if (
                    e.target === lightbox ||
                    e.target.classList.contains(
                        'lightbox-content-wrapper'
                    )
                ) {

                    closeLightbox();
                }
            }
        );
    }


    // ========================================================
    // ESC KEY
    // ========================================================

    document.addEventListener(
        'keydown',
        e => {

            if (
                e.key === 'Escape' &&
                lightbox.classList.contains(
                    'active'
                )
            ) {

                closeLightbox();
            }
        }
    );

});