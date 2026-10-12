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
            'ImageKit Content-Type:',
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
    // GET COMPATIBLE VIDEO URL
    // ========================================================
    //
    // ImageKit free plan blocks direct video access with
    // "Video transformations limit exceeded" (HTTP 403).
    //
    // Using tr:orig-true/ in the URL path tells ImageKit
    // to serve the ORIGINAL file without any transformation,
    // which does NOT count toward transformation limits.
    //
    // All videos are already in compatible codecs:
    //   - H.264 / AAC / MP4
    //   - HEVC  / AAC / MP4 (works on Chrome, Safari, Edge)
    // ========================================================

    function getCompatibleVideoUrl(url) {

        if (!url) {
            return '';
        }


        try {

            const parsedUrl =
                new URL(url);


            if (
                parsedUrl.hostname.includes(
                    'ik.imagekit.io'
                )
            ) {

                // Remove any existing transformation
                // query params to avoid 403 errors.

                parsedUrl.searchParams.delete(
                    'tr'
                );


                // Insert tr:orig-true/ after the
                // ImageKit ID in the URL path.
                //
                // Before: /o5o3ly3x4/projects/file.mp4
                // After:  /o5o3ly3x4/tr:orig-true/projects/file.mp4

                const pathParts =
                    parsedUrl.pathname.split('/');


                if (
                    pathParts.length >= 2 &&
                    !pathParts.includes(
                        'tr:orig-true'
                    )
                ) {

                    pathParts.splice(
                        2,
                        0,
                        'tr:orig-true'
                    );

                    parsedUrl.pathname =
                        pathParts.join('/');
                }


                return parsedUrl.toString();
            }


        } catch (error) {

            console.warn(
                'Could not process video URL:',
                error
            );
        }


        return url;
    }


    // ========================================================
    // GET VIDEO MIME TYPE
    // ========================================================

    function getVideoMime(url) {

        if (!url) {
            return 'video/mp4';
        }

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

                        // Convert ImageKit video
                        // to MP4 / H.264 / AAC.

                        const videoUrl =
                            getCompatibleVideoUrl(
                                finalMediaUrl
                            );


                        const mimeType =
                            getVideoMime(
                                videoUrl
                            );


                        mediaElement = `

                            <video
                                class="gallery-video"
                                src="${videoUrl}"
                                muted
                                autoplay
                                loop
                                playsinline
                                webkit-playsinline
                                preload="metadata"
                                disablepictureinpicture
                                data-video-url="${videoUrl}"
                                data-video-mime="${mimeType}"
                                aria-label="${project.title || 'Project video'}"
                            >

                                <source
                                    src="${videoUrl}"
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
        // INITIALIZE VIDEO ATTRIBUTES (WITHOUT FORCE-PLAYING ALL AT ONCE)
        // ======================================================

        videos.forEach(video => {

            video.muted = true;

            video.defaultMuted = true;

            video.playsInline = true;

            video.setAttribute('playsinline', '');

            video.setAttribute('webkit-playsinline', '');

            video.setAttribute('muted', '');


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

                    card.style.borderRadius =
                        '12px';

                    card.style.position =
                        'relative';

                    card.style.cursor =
                        'pointer';


                    const logo =
                        document.createElement(
                            'img'
                        );

                    logo.src =
                        client.logo_url;

                    logo.alt =
                        client.name ||
                        'Client logo';

                    logo.style.width =
                        '80%';

                    logo.style.height =
                        '80%';

                    logo.style.objectFit =
                        'contain';

                    logo.style.transition =
                        'transform 0.3s ease';


                    card.appendChild(
                        logo
                    );


                    const name =
                        document.createElement(
                            'div'
                        );

                    name.textContent =
                        client.name ||
                        '';

                    name.style.position =
                        'absolute';

                    name.style.bottom =
                        '10px';

                    name.style.left =
                        '10px';

                    name.style.right =
                        '10px';

                    name.style.textAlign =
                        'center';

                    name.style.color =
                        '#fff';

                    name.style.fontSize =
                        '14px';

                    name.style.fontWeight =
                        '600';


                    card.appendChild(
                        name
                    );


                    if (
                        client.website_url
                    ) {

                        const link =
                            document.createElement(
                                'a'
                            );

                        link.href =
                            client.website_url;

                        link.target =
                            '_blank';

                        link.rel =
                            'noopener noreferrer';

                        link.style.position =
                            'absolute';

                        link.style.inset =
                            '0';

                        link.style.zIndex =
                            '2';

                        link.setAttribute(
                            'aria-label',
                            client.name ||
                            'Client website'
                        );

                        card.appendChild(
                            link
                        );

                    }


                    card.addEventListener(
                        'mouseenter',
                        () => {

                            logo.style.transform =
                                'scale(1.05)';

                            card.style.transform =
                                'translateY(-4px)';

                        }
                    );


                    card.addEventListener(
                        'mouseleave',
                        () => {

                            logo.style.transform =
                                'scale(1)';

                            card.style.transform =
                                'translateY(0)';

                        }
                    );


                    wrapper.appendChild(
                        card
                    );

                    mainClientsGrid.appendChild(
                        wrapper
                    );

                });


        } catch (
        error
        ) {

            console.error(
                'Error loading clients:',
                error
            );

        }

    }


    // ==================================================
    // LIGHTBOX
    // ==================================================

    function openLightbox(
        project
    ) {

        lightboxMediaContainer.innerHTML =
            '';


        if (
            project.media_url
        ) {

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

                // Pause background gallery videos to free hardware decoders
                const bgVideos =
                    galleryGrid.querySelectorAll('video.gallery-video');
                bgVideos.forEach(v => v.pause());

                const videoUrl =
                    getCompatibleVideoUrl(
                        finalMediaUrl
                    );

                const mimeType =
                    getVideoMime(
                        videoUrl
                    );

                const video =
                    document.createElement(
                        'video'
                    );

                video.src =
                    videoUrl;

                video.controls =
                    true;

                video.autoplay =
                    true;

                video.playsInline =
                    true;

                video.setAttribute(
                    'playsinline',
                    ''
                );

                video.setAttribute(
                    'webkit-playsinline',
                    ''
                );

                video.preload =
                    'auto';

                video.style.maxWidth =
                    '100%';

                video.style.maxHeight =
                    '80vh';

                const source =
                    document.createElement(
                        'source'
                    );

                source.src =
                    videoUrl;

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
                            videoUrl,
                            mimeType
                        );

                    }
                );

                lightboxMediaContainer.appendChild(
                    video
                );

                video.load();

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

            }

            // ==================================================
            // IMAGE LIGHTBOX
            // ==================================================

            else {

                const image =
                    document.createElement(
                        'img'
                    );

                image.src =
                    finalMediaUrl;

                image.alt =
                    project.title ||
                    'Project image';

                image.style.maxWidth =
                    '100%';

                image.style.maxHeight =
                    '80vh';

                image.style.objectFit =
                    'contain';

                lightboxMediaContainer.appendChild(
                    image
                );

            }

        }


        if (
            lightbox
        ) {

            lightbox.classList.add(
                'active'
            );

            document.body.style.overflow =
                'hidden';

        }

    }


    function closeLightbox() {

        if (
            lightbox
        ) {

            lightbox.classList.remove(
                'active'
            );

            document.body.style.overflow =
                '';

            const activeVid =
                lightboxMediaContainer.querySelector('video');

            if (
                activeVid
            ) {

                activeVid.pause();

                activeVid.removeAttribute('src');

                activeVid.load();

            }

            lightboxMediaContainer.innerHTML =
                '';

        }

    }


    if (
        lightboxCloseBtn
    ) {

        lightboxCloseBtn.addEventListener(
            'click',
            closeLightbox
        );

    }


    if (
        lightbox
    ) {

        lightbox.addEventListener(
            'click',
            (
                event
            ) => {

                if (
                    event.target ===
                    lightbox
                ) {

                    closeLightbox();

                }

            }
        );

    }


    document.addEventListener(
        'keydown',
        (
            event
        ) => {

            if (
                event.key ===
                'Escape'
            ) {

                closeLightbox();

            }

        }
    );


});
