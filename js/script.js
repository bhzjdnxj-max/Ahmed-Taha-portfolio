window.diagnoseVideoError = async function (videoElement, url, mimeType) {
    console.group(`Video Diagnostic: ${url}`);

    const canPlay = videoElement.canPlayType(mimeType);

    console.log(
        `1. Browser canPlayType('${mimeType}'):`,
        canPlay ? `Yes ('${canPlay}')` : 'No'
    );

    try {
        const response = await fetch(url, { method: 'HEAD' });

        console.log(
            `2. Supabase Response Content-Type:`,
            response.headers.get('content-type')
        );
    } catch (e) {
        console.log(
            `2. Could not fetch HEAD request (CORS or network error):`,
            e.message
        );
    }

    console.log(`3. Video URL being used:`, url);

    if (videoElement.error) {
        const errorCodes = {
            1: 'MEDIA_ERR_ABORTED',
            2: 'MEDIA_ERR_NETWORK',
            3: 'MEDIA_ERR_DECODE (Codec not supported/corrupted)',
            4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
        };

        console.error(
            `4. HTML5 Video Error Code:`,
            videoElement.error.code,
            '-',
            errorCodes[videoElement.error.code] || 'UNKNOWN'
        );
    } else {
        console.log(
            `4. No explicit videoElement.error property set.`
        );
    }

    console.groupEnd();

    const parent = videoElement.parentElement;

    if (parent) {
        parent.innerHTML = `
            <div style="
                width:100%;
                height:100%;
                display:flex;
                align-items:center;
                justify-content:center;
                background:rgba(255,255,255,0.05);
                color:var(--text-secondary);
                flex-direction:column;
                padding:1rem;
                text-align:center;
            ">
                <span>Video format/codec not supported in this browser.</span>

                <a
                    href="${url}"
                    target="_blank"
                    style="
                        color:#3b82f6;
                        margin-top:0.5rem;
                        text-decoration:none;
                    "
                >
                    Download Video
                </a>
            </div>
        `;
    }
};


document.addEventListener('DOMContentLoaded', () => {

    // --------------------------------------------------
    // Elements
    // --------------------------------------------------

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


    // --------------------------------------------------
    // Year
    // --------------------------------------------------

    const yearElement = document.getElementById('year');

    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }


    // --------------------------------------------------
    // Navigation
    // --------------------------------------------------

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

        }, 300);

    });


    // --------------------------------------------------
    // Supabase Data Fetching
    // --------------------------------------------------

    async function fetchProjects() {

        if (!window.supabaseClient) {

            console.warn(
                "Supabase unavailable — displaying portfolio without dynamic projects."
            );

            return [];

        }

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(
                () => reject(new Error('Supabase request timeout')),
                5000
            )
        );


        try {

            const fetchPromise = window.supabaseClient
                .from('projects')
                .select('*')
                .eq('published', true)
                .order('created_at', {
                    ascending: false
                });


            const response = await Promise.race([
                fetchPromise,
                timeoutPromise
            ]);


            if (response.error) {
                throw response.error;
            }


            return response.data || [];

        } catch (error) {

            console.error(
                "Error fetching projects:",
                error.message
            );

            return [];

        }

    }


    // --------------------------------------------------
    // Profile Photo
    // --------------------------------------------------

    async function fetchProfilePhoto() {

        if (!window.supabaseClient) {
            return;
        }


        try {

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(
                    () => reject(new Error('timeout')),
                    3000
                )
            );


            const fetchPromise = window.supabaseClient
                .from('settings')
                .select('profile_photo_url')
                .eq('id', 1)
                .single();


            const response = await Promise.race([
                fetchPromise,
                timeoutPromise
            ]);


            if (
                response.data &&
                response.data.profile_photo_url
            ) {

                const profileImg =
                    document.getElementById('profile-img');


                if (profileImg) {

                    profileImg.src =
                        response.data.profile_photo_url;

                }

            }

        } catch (error) {

            console.warn(
                "Could not load profile photo from Supabase",
                error.message
            );

        }

    }


    // --------------------------------------------------
    // Load Data
    // --------------------------------------------------

    async function loadDataIfNeeded() {

        if (isDataLoaded || isLoading) {
            return;
        }


        isLoading = true;


        try {

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


    // Load data shortly after page load

    setTimeout(
        loadDataIfNeeded,
        500
    );


    // --------------------------------------------------
    // Category View
    // --------------------------------------------------

    async function openCategory(category) {

        mainView.classList.remove('active');


        if (!isDataLoaded) {

            galleryGrid.innerHTML = `
                <div style="
                    grid-column:1/-1;
                    text-align:center;
                    color:var(--text-secondary);
                ">
                    Loading...
                </div>
            `;


            galleryEmpty.style.display = 'none';


            await loadDataIfNeeded();

        }


        setTimeout(() => {

            galleryTitle.textContent =
                category.toUpperCase();


            renderGallery(category);


            galleryView.classList.add('active');


            window.scrollTo(0, 0);

        }, 300);

    }


    // --------------------------------------------------
    // Render Gallery
    // --------------------------------------------------

    function renderGallery(category) {

        galleryGrid.innerHTML = '';


        const filteredProjects =
            allProjects.filter(
                p => p.category === category
            );


        if (filteredProjects.length === 0) {

            galleryEmpty.style.display = 'block';

            return;

        }


        galleryEmpty.style.display = 'none';


        filteredProjects.forEach((project, index) => {

            const card =
                document.createElement('div');


            card.className =
                'project-card';


            if (
                index % 4 === 0 &&
                project.type === 'video'
            ) {

                card.classList.add('wide');

            }


            let mediaElement = '';


            if (project.media_url) {

                let finalMediaUrl =
                    project.media_url;


                // Convert relative Supabase path
                // to public URL

                if (
                    !finalMediaUrl.startsWith('http://') &&
                    !finalMediaUrl.startsWith('https://') &&
                    window.supabaseClient
                ) {

                    finalMediaUrl =
                        window.supabaseClient
                            .storage
                            .from('portfolio-media')
                            .getPublicUrl(
                                finalMediaUrl
                            )
                            .data
                            .publicUrl;

                }


                // --------------------------------------------------
                // VIDEO
                // --------------------------------------------------

                if (project.type === 'video') {

                    const ext =
                        finalMediaUrl
                            .split('.')
                            .pop()
                            .split('?')[0]
                            .toLowerCase();


                    const mimeMap = {

                        mp4: 'video/mp4',

                        mov: 'video/quicktime',

                        webm: 'video/webm',

                        m4v: 'video/mp4'

                    };


                    const mimeType =
                        mimeMap[ext] ||
                        'video/mp4';


                    // IMPORTANT:
                    // Use <source> instead of direct src
                    // and preload metadata.

                    mediaElement = `
                        <video
                            muted
                            loop
                            playsinline
                            preload="metadata"
                            onmouseover="
                                var p=this.play();
                                if(p!==undefined)
                                    p.catch(function(){});
                            "
                            onmouseout="this.pause()"
                            onerror="
                                window.diagnoseVideoError &&
                                window.diagnoseVideoError(
                                    this,
                                    '${finalMediaUrl}',
                                    '${mimeType}'
                                )
                            "
                        >
                            <source
                                src="${finalMediaUrl}"
                                type="${mimeType}"
                            >
                        </video>
                    `;


                } else {

                    // --------------------------------------------------
                    // IMAGE
                    // --------------------------------------------------

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
                        <i class="fa-solid fa-image fa-3x"></i>
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
                        ${project.type}
                    </span>

                </div>
            `;


            card.addEventListener(
                'click',
                () => openLightbox(project)
            );


            galleryGrid.appendChild(card);

        });

    }


    // --------------------------------------------------
    // Clients
    // --------------------------------------------------

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


        mainClientsGrid.innerHTML = '';


        if (!window.supabaseClient) {

            mainClientsEmpty.style.display =
                'block';

            return;

        }


        try {

            const timeoutPromise =
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(
                            new Error(
                                'Supabase request timeout'
                            )
                        ),
                        5000
                    )
                );


            const fetchPromise =
                window.supabaseClient
                    .from('clients')
                    .select('*')
                    .eq('published', true)
                    .order('created_at', {
                        ascending: false
                    });


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

                mainClientsEmpty.style.display =
                    'block';

                return;

            }


            mainClientsEmpty.style.display =
                'none';


            response.data.forEach(client => {

                const wrapper =
                    document.createElement('div');


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
                    document.createElement('div');


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


                let logoHtml = client.logo_url

                    ? `
                        <img
                            src="${client.logo_url}"
                            alt="${client.name}"
                            style="
                                width:100%;
                                height:100%;
                                object-fit:cover;
                                filter:grayscale(100%) opacity(0.8);
                                transition:all 0.5s ease;
                            "
                            onmouseover="
                                this.style.filter='grayscale(0%) opacity(1)';
                                this.style.transform='scale(1.05)';
                            "
                            onmouseout="
                                this.style.filter='grayscale(100%) opacity(0.8)';
                                this.style.transform='scale(1)';
                            "
                        >
                    `

                    : `
                        <h3 style="
                            font-family:var(--font-display);
                            color:rgba(255,255,255,0.7);
                            font-size:1.5rem;
                            text-transform:uppercase;
                        ">
                            ${client.name}
                        </h3>
                    `;


                card.innerHTML =
                    logoHtml;


                const nameLabel =
                    document.createElement('p');


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


                wrapper.appendChild(card);

                wrapper.appendChild(nameLabel);


                if (client.website_link) {

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
                        'mouseover',
                        () => {

                            card.style.background =
                                'rgba(255,255,255,0.05)';

                        }
                    );


                    card.addEventListener(
                        'mouseout',
                        () => {

                            card.style.background =
                                'rgba(0,0,0,0.2)';

                        }
                    );

                }


                mainClientsGrid.appendChild(
                    wrapper
                );

            });


        } catch (error) {

            console.error(
                "Error fetching clients:",
                error.message
            );


            mainClientsEmpty.style.display =
                'block';

        }

    }


    // --------------------------------------------------
    // Lightbox
    // --------------------------------------------------

    function openLightbox(project) {

        lightboxMediaContainer.innerHTML =
            '';


        if (project.media_url) {

            let finalMediaUrl =
                project.media_url;


            if (
                !finalMediaUrl.startsWith('http://') &&
                !finalMediaUrl.startsWith('https://') &&
                window.supabaseClient
            ) {

                finalMediaUrl =
                    window.supabaseClient
                        .storage
                        .from('portfolio-media')
                        .getPublicUrl(
                            finalMediaUrl
                        )
                        .data
                        .publicUrl;

            }


            // --------------------------------------------------
            // VIDEO LIGHTBOX
            // --------------------------------------------------

            if (project.type === 'video') {

                const ext =
                    finalMediaUrl
                        .split('.')
                        .pop()
                        .split('?')[0]
                        .toLowerCase();


                const mimeMap = {

                    mp4: 'video/mp4',

                    mov: 'video/quicktime',

                    webm: 'video/webm',

                    m4v: 'video/mp4'

                };


                const mimeType =
                    mimeMap[ext] ||
                    'video/mp4';


                lightboxMediaContainer.innerHTML = `
                    <video
                        controls
                        autoplay
                        playsinline
                        preload="metadata"
                        onerror="
                            window.diagnoseVideoError &&
                            window.diagnoseVideoError(
                                this,
                                '${finalMediaUrl}',
                                '${mimeType}'
                            )
                        "
                    >
                        <source
                            src="${finalMediaUrl}"
                            type="${mimeType}"
                        >
                    </video>
                `;


            } else {

                // --------------------------------------------------
                // IMAGE LIGHTBOX
                // --------------------------------------------------

                lightboxMediaContainer.innerHTML = `
                    <img
                        src="${finalMediaUrl}"
                        alt="${project.title || 'Project'}"
                    >
                `;

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


        lightboxTitle.textContent =
            project.title || 'Untitled';


        lightboxDesc.textContent =
            project.description || '';


        if (project.project_link) {

            lightboxLink.href =
                project.project_link;


            lightboxLink.style.display =
                'inline-block';

        } else {

            lightboxLink.style.display =
                'none';

        }


        lightbox.classList.add('active');


        document.body.style.overflow =
            'hidden';

    }


    // --------------------------------------------------
    // Close Lightbox
    // --------------------------------------------------

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


    lightboxCloseBtn.addEventListener(
        'click',
        closeLightbox
    );


    // Close by clicking outside

    lightbox.addEventListener(
        'click',
        (e) => {

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


    // Close with ESC

    document.addEventListener(
        'keydown',
        (e) => {

            if (
                e.key === 'Escape' &&
                lightbox.classList.contains('active')
            ) {

                closeLightbox();

            }

        }
    );

});