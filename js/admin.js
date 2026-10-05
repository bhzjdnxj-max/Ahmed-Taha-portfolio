document.addEventListener('DOMContentLoaded', () => {
    if (!window.supabaseClient) {
        alert("Supabase client not initialized. Check js/supabase.js");
        return;
    }

    const supabase = window.supabaseClient;

    // =========================================================
    // VIEWS
    // =========================================================
    const authView = document.getElementById('auth-view');
    const dashboardView = document.getElementById('dashboard-view');

    // =========================================================
    // AUTH ELEMENTS
    // =========================================================
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('logout-btn');

    // =========================================================
    // TAB NAVIGATION
    // =========================================================
    const navBtns = document.querySelectorAll('.nav-btn[data-tab]');
    const tabContents = document.querySelectorAll('.tab-content');

    let currentTab = 'projects';

    // =========================================================
    // STATE
    // =========================================================
    let projectsData = [];
    let clientsData = [];

    // =========================================================
    // IMAGEKIT
    // =========================================================
    const IMAGEKIT_PUBLIC_KEY =
        'public_sPfzMufYJeCgpW98BdEuMw/09Rg=';

    async function uploadToImageKit(
        file,
        fileName,
        folder
    ) {

        const authResponse =
            await fetch('/api/imagekit-auth');

        if (!authResponse.ok) {

            const errorText =
                await authResponse.text();

            throw new Error(
                `Could not get ImageKit authentication. ${errorText}`
            );
        }

        const auth =
            await authResponse.json();

        if (
            !auth.signature ||
            !auth.token ||
            !auth.expire
        ) {

            throw new Error(
                'ImageKit authentication parameters are incomplete.'
            );
        }

        const formData =
            new FormData();

        formData.append(
            'file',
            file
        );

        formData.append(
            'fileName',
            fileName
        );

        formData.append(
            'publicKey',
            IMAGEKIT_PUBLIC_KEY
        );

        formData.append(
            'signature',
            auth.signature
        );

        formData.append(
            'expire',
            auth.expire
        );

        formData.append(
            'token',
            auth.token
        );

        formData.append(
            'folder',
            folder
        );

        const response =
            await fetch(
                'https://upload.imagekit.io/api/v1/files/upload',
                {
                    method: 'POST',
                    body: formData
                }
            );

        const result =
            await response.json();

        if (!response.ok) {

            console.error(
                'ImageKit upload response:',
                result
            );

            throw new Error(
                result.message ||
                result.help ||
                'ImageKit upload failed.'
            );
        }

        if (!result.url) {

            throw new Error(
                'ImageKit upload completed but no URL was returned.'
            );
        }

        return result;
    }

    // =========================================================
    // INITIALIZATION
    // =========================================================
    async function init() {

        const {
            data: {
                session
            }
        } = await supabase.auth.getSession();

        if (session) {
            showDashboard();
        } else {
            showLogin();
        }

        // Listen for auth changes
        supabase.auth.onAuthStateChange(
            (event, session) => {

                if (event === 'SIGNED_IN') {
                    showDashboard();
                }

                if (event === 'SIGNED_OUT') {
                    showLogin();
                }
            }
        );
    }

    // =========================================================
    // VIEW SWITCHING
    // =========================================================
    function showLogin() {

        dashboardView.classList.remove('active');

        authView.classList.add('active');
    }

    function showDashboard() {

        authView.classList.remove('active');

        dashboardView.classList.add('active');

        loadData(currentTab);
    }

    // =========================================================
    // AUTH FLOW
    // =========================================================
    loginForm.addEventListener(
        'submit',
        async (e) => {

            e.preventDefault();

            const email =
                document.getElementById('email').value;

            const password =
                document.getElementById('password').value;

            const btn =
                loginForm.querySelector('button');

            btn.disabled = true;

            btn.textContent = 'Logging in...';

            loginError.textContent = '';

            const {
                error
            } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {

                loginError.textContent =
                    error.message;

                btn.disabled = false;

                btn.textContent = 'Login';
            }
        }
    );

    logoutBtn.addEventListener(
        'click',
        async () => {

            await supabase.auth.signOut();
        }
    );

    // =========================================================
    // TAB SWITCHING
    // =========================================================
    navBtns.forEach(
        btn => {

            btn.addEventListener(
                'click',
                () => {

                    navBtns.forEach(
                        b => b.classList.remove('active')
                    );

                    tabContents.forEach(
                        c => c.classList.remove('active')
                    );

                    btn.classList.add('active');

                    currentTab =
                        btn.getAttribute('data-tab');

                    document
                        .getElementById(
                            `tab-${currentTab}`
                        )
                        .classList.add('active');

                    loadData(currentTab);
                }
            );
        }
    );

    // =========================================================
    // DATA LOADING
    // =========================================================
    async function loadData(tab) {

        if (tab === 'projects') {
            await loadProjects();
        }

        if (tab === 'clients') {
            await loadClients();
        }
    }

    // =========================================================
    // PROJECTS MANAGEMENT
    // =========================================================
    const projectsTbody =
        document.getElementById(
            'projects-tbody'
        );

    const projectModal =
        document.getElementById(
            'project-modal'
        );

    const addProjectBtn =
        document.getElementById(
            'add-project-btn'
        );

    const projectForm =
        document.getElementById(
            'project-form'
        );

    const projectSaveBtn =
        document.getElementById(
            'project-save-btn'
        );

    const projectFormStatus =
        document.getElementById(
            'project-form-status'
        );

    // =========================================================
    // LOAD PROJECTS
    // =========================================================
    async function loadProjects() {

        projectsTbody.innerHTML =
            '<tr><td colspan="5">Loading...</td></tr>';

        const {
            data,
            error
        } = await supabase
            .from('projects')
            .select('*')
            .order(
                'created_at',
                {
                    ascending: false
                }
            );

        if (error) {

            projectsTbody.innerHTML =
                `<tr>
                    <td colspan="5" style="color:var(--danger)">
                        Error loading projects: ${error.message}
                    </td>
                </tr>`;

            return;
        }

        projectsData =
            data || [];

        renderProjects();
    }

    // =========================================================
    // RENDER PROJECTS
    // =========================================================
    function renderProjects() {

        projectsTbody.innerHTML = '';

        if (projectsData.length === 0) {

            projectsTbody.innerHTML =
                '<tr><td colspan="5">No projects found.</td></tr>';

            return;
        }

        projectsData.forEach(
            p => {

                const tr =
                    document.createElement('tr');

                let mediaHtml = '';

                let finalMediaUrl =
                    p.media_url;

                if (
                    finalMediaUrl &&
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

                if (p.type === 'video') {

                    mediaHtml =
                        `<video
                            src="${finalMediaUrl}"
                            class="thumb"
                            muted
                            preload="metadata"
                            onerror="this.outerHTML='<div class=\\'thumb\\' style=\\'display:flex;align-items:center;justify-content:center;background:#222;color:#999;font-size:10px;text-align:center;padding:0.5rem;\\'>Unsupported<br>Format</div>'"
                        >
                            Unsupported format
                        </video>`;

                } else {

                    mediaHtml =
                        `<img
                            src="${finalMediaUrl}"
                            class="thumb"
                        >`;
                }

                const statusClass =
                    p.published
                        ? 'published'
                        : 'draft';

                const statusText =
                    p.published
                        ? 'Published'
                        : 'Draft';

                tr.innerHTML = `
                    <td>${mediaHtml}</td>

                    <td>
                        <strong>${p.title}</strong>
                    </td>

                    <td>
                        ${p.category}
                    </td>

                    <td>
                        <span class="status-badge ${statusClass}">
                            ${statusText}
                        </span>
                    </td>

                    <td>

                        <button
                            class="action-btn edit-project"
                            data-id="${p.id}"
                        >
                            <i class="fa-solid fa-pen"></i>
                        </button>

                        <button
                            class="action-btn delete delete-project"
                            data-id="${p.id}"
                        >
                            <i class="fa-solid fa-trash"></i>
                        </button>

                    </td>
                `;

                projectsTbody.appendChild(tr);
            }
        );

        document
            .querySelectorAll('.edit-project')
            .forEach(
                btn => {

                    btn.addEventListener(
                        'click',
                        e => {

                            openProjectModal(
                                e.currentTarget
                                    .getAttribute(
                                        'data-id'
                                    )
                            );
                        }
                    );
                }
            );

        document
            .querySelectorAll('.delete-project')
            .forEach(
                btn => {

                    btn.addEventListener(
                        'click',
                        e => {

                            deleteProject(
                                e.currentTarget
                                    .getAttribute(
                                        'data-id'
                                    )
                            );
                        }
                    );
                }
            );
    }

    // =========================================================
    // OPEN PROJECT MODAL
    // =========================================================
    addProjectBtn.addEventListener(
        'click',
        () => openProjectModal()
    );

    function openProjectModal(id = null) {

        projectForm.reset();

        projectFormStatus.textContent = '';

        projectFormStatus.className =
            'status-msg';

        if (id) {

            const project =
                projectsData.find(
                    p => p.id == id
                );

            if (project) {

                document
                    .getElementById(
                        'project-modal-title'
                    )
                    .textContent =
                    'Edit Project';

                document
                    .getElementById(
                        'project-id'
                    )
                    .value =
                    project.id;

                document
                    .getElementById(
                        'project-title'
                    )
                    .value =
                    project.title || '';

                document
                    .getElementById(
                        'project-category'
                    )
                    .value =
                    project.category ||
                    'Wedding';

                document
                    .getElementById(
                        'project-desc'
                    )
                    .value =
                    project.description || '';

                document
                    .getElementById(
                        'project-link'
                    )
                    .value =
                    project.project_link || '';

                document
                    .getElementById(
                        'project-published'
                    )
                    .checked =
                    project.published;

                // File input stays empty when editing
            }

        } else {

            document
                .getElementById(
                    'project-modal-title'
                )
                .textContent =
                'Add Project';

            document
                .getElementById(
                    'project-id'
                )
                .value = '';
        }

        projectModal.classList.add('active');
    }

    // =========================================================
    // FFMPEG VIDEO CONVERTER
    // =========================================================

    let ffmpegInstance = null;

    let ffmpegScriptPromise = null;

    // =========================================================
    // LOAD FFMPEG
    // =========================================================
    async function loadFFmpeg() {

        // Already loaded
        if (ffmpegInstance) {

            return ffmpegInstance;
        }

        // Start loading the FFmpeg library
        if (!ffmpegScriptPromise) {

            ffmpegScriptPromise =
                new Promise(
                    (resolve, reject) => {

                        // Check if FFmpeg is already available
                        if (
                            window.FFmpeg &&
                            window.FFmpeg.createFFmpeg
                        ) {

                            resolve();

                            return;
                        }

                        const script =
                            document.createElement(
                                'script'
                            );

                        script.src =
                            'https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js';

                        script.async = true;

                        script.onload =
                            () => {

                                resolve();
                            };

                        script.onerror =
                            () => {

                                reject(
                                    new Error(
                                        'Could not load the video converter. Please check your internet connection.'
                                    )
                                );
                            };

                        document.head.appendChild(
                            script
                        );
                    }
                );
        }

        await ffmpegScriptPromise;

        if (
            !window.FFmpeg ||
            !window.FFmpeg.createFFmpeg
        ) {

            throw new Error(
                'Video converter loaded incorrectly. Please refresh the page and try again.'
            );
        }

        ffmpegInstance =
            window.FFmpeg.createFFmpeg({

                log: false,

                corePath:
                    'https://unpkg.com/@ffmpeg/core@0.11.6/dist/ffmpeg-core.js',

                progress:
                    ({
                        ratio
                    }) => {

                        const percent =
                            Math.max(
                                0,
                                Math.min(
                                    100,
                                    Math.round(
                                        ratio * 100
                                    )
                                )
                            );

                        projectFormStatus.textContent =
                            `Converting video... ${percent}%`;
                    }
            });

        projectFormStatus.textContent =
            'Loading video converter... (first time only)';

        await ffmpegInstance.load();

        return ffmpegInstance;
    }

    // =========================================================
    // CONVERT VIDEO TO MP4
    // =========================================================
    async function convertVideoToMp4(file) {

        const ffmpeg =
            await loadFFmpeg();

        const inputExt =
            (
                file.name
                    .split('.')
                    .pop() ||
                'mp4'
            ).toLowerCase();

        const inputName =
            `input_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2)}.${inputExt}`;

        const outputName =
            `output_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2)}.mp4`;

        try {

            projectFormStatus.textContent =
                'Preparing video...';

            // Put original video inside FFmpeg memory
            ffmpeg.FS(
                'writeFile',
                inputName,
                await window.FFmpeg.fetchFile(
                    file
                )
            );

            projectFormStatus.textContent =
                'Converting video to MP4...';

            // Convert to browser-compatible MP4
            await ffmpeg.run(

                '-i',
                inputName,

                '-c:v',
                'libx264',

                '-preset',
                'veryfast',

                '-crf',
                '23',

                '-pix_fmt',
                'yuv420p',

                '-c:a',
                'aac',

                '-b:a',
                '128k',

                '-movflags',
                '+faststart',

                '-y',
                outputName
            );

            // Read converted video
            const outputData =
                ffmpeg.FS(
                    'readFile',
                    outputName
                );

            const blob =
                new Blob(
                    [
                        outputData.buffer
                    ],
                    {
                        type: 'video/mp4'
                    }
                );

            // Return MP4 file
            return new File(
                [
                    blob
                ],

                `${file.name.replace(
                    /\.[^/.]+$/,
                    ''
                )}.mp4`,

                {
                    type: 'video/mp4',

                    lastModified:
                        Date.now()
                }
            );

        } finally {

            // Clean FFmpeg memory
            try {

                ffmpeg.FS(
                    'unlink',
                    inputName
                );

            } catch (_) { }

            try {

                ffmpeg.FS(
                    'unlink',
                    outputName
                );

            } catch (_) { }
        }
    }

    // =========================================================
    // SAVE PROJECT
    // =========================================================
    projectForm.addEventListener(
        'submit',
        async (e) => {

            e.preventDefault();

            projectSaveBtn.disabled = true;

            projectSaveBtn.textContent =
                'Saving...';

            projectFormStatus.textContent =
                '';

            projectFormStatus.className =
                'status-msg';

            const id =
                document
                    .getElementById(
                        'project-id'
                    )
                    .value;

            const title =
                document
                    .getElementById(
                        'project-title'
                    )
                    .value;

            const category =
                document
                    .getElementById(
                        'project-category'
                    )
                    .value;

            const description =
                document
                    .getElementById(
                        'project-desc'
                    )
                    .value;

            const project_link =
                document
                    .getElementById(
                        'project-link'
                    )
                    .value;

            const published =
                document
                    .getElementById(
                        'project-published'
                    )
                    .checked;

            const fileInput =
                document
                    .getElementById(
                        'project-file'
                    );

            try {

                let media_url = '';

                let type = 'image';

                // =================================================
                // FILE UPLOAD
                // =================================================
                if (
                    fileInput.files.length > 0
                ) {

                    const originalFile =
                        fileInput.files[0];

                    // Video MIME types
                    const videoMimeTypes = [

                        'video/mp4',

                        'video/quicktime',

                        'video/webm',

                        'video/x-m4v',

                        'video/x-matroska',

                        'video/avi',

                        'video/x-msvideo'

                    ];

                    // Video extensions
                    const videoExtensions = [

                        'mp4',

                        'mov',

                        'webm',

                        'm4v',

                        'mkv',

                        'avi',

                        'wmv',

                        'flv'

                    ];

                    const originalExt =
                        (
                            originalFile.name
                                .split('.')
                                .pop() ||
                            ''
                        ).toLowerCase();

                    // Detect whether file is video
                    type =
                        (
                            originalFile.type.startsWith(
                                'video/'
                            )

                            ||

                            videoMimeTypes.includes(
                                originalFile.type
                            )

                            ||

                            videoExtensions.includes(
                                originalExt
                            )

                        )
                            ? 'video'
                            : 'image';


                    // =================================================
                    // FILE THAT WILL ACTUALLY BE UPLOADED
                    // =================================================
                    let fileToUpload =
                        originalFile;

                    let contentType =
                        originalFile.type ||
                        'image/jpeg';


                    // =================================================
                    // AUTOMATIC VIDEO CONVERSION
                    // =================================================
                    if (
                        type === 'video'
                    ) {

                        projectFormStatus.textContent =
                            'Preparing automatic video conversion...';

                        // Convert ANY video to MP4
                        fileToUpload =
                            await convertVideoToMp4(
                                originalFile
                            );

                        contentType =
                            'video/mp4';
                    }


                    // =================================================
                    // CREATE FILE NAME
                    // =================================================
                    const fileName =
                        `${Math.random()
                            .toString(36)
                            .substring(2, 15)}_${Date.now()}.${type === 'video'
                                ? 'mp4'
                                : originalExt
                        }`;


                    // =================================================
                    // UPLOAD TO IMAGEKIT
                    // =================================================
                    projectFormStatus.textContent =
                        type === 'video'
                            ? 'Uploading converted MP4 to ImageKit...'
                            : 'Uploading image to ImageKit...';

                    console.log(
                        'Uploading to ImageKit:',
                        fileName
                    );

                    console.log(
                        'Content Type:',
                        contentType
                    );

                    const imageKitResult =
                        await uploadToImageKit(
                            fileToUpload,
                            fileName,
                            'projects'
                        );

                    media_url =
                        imageKitResult.url;

                    console.log(
                        'ImageKit media_url:',
                        media_url
                    );
                }


                // =================================================
                // NEW PROJECT MUST HAVE MEDIA
                // =================================================
                else if (!id) {

                    throw new Error(
                        'A media file is required for new projects.'
                    );
                }


                // =================================================
                // SAFETY CHECK
                // =================================================
                if (
                    !id &&
                    !media_url
                ) {

                    throw new Error(
                        'Upload completed but media URL could not be resolved. Please try again.'
                    );
                }


                // =================================================
                // PROJECT DATA
                // =================================================
                const projectData = {

                    title,

                    category,

                    description,

                    project_link,

                    published
                };


                // =================================================
                // ADD MEDIA DATA
                // =================================================
                if (
                    fileInput.files.length > 0
                ) {

                    projectData.media_url =
                        media_url;

                    projectData.type =
                        type;
                }


                // =================================================
                // SAVE TO DATABASE
                // =================================================
                projectFormStatus.textContent =
                    'Saving project...';


                if (id) {

                    const {
                        error
                    } = await supabase
                        .from('projects')
                        .update(
                            projectData
                        )
                        .eq(
                            'id',
                            id
                        );

                    if (error) {
                        throw error;
                    }

                    projectFormStatus.textContent =
                        'Project updated successfully!';

                } else {

                    const {
                        error
                    } = await supabase
                        .from('projects')
                        .insert([
                            projectData
                        ]);

                    if (error) {
                        throw error;
                    }

                    projectFormStatus.textContent =
                        'Project created successfully!';
                }


                // =================================================
                // SUCCESS
                // =================================================
                projectFormStatus.className =
                    'status-msg success';


                setTimeout(
                    () => {

                        projectModal
                            .classList
                            .remove('active');

                        loadProjects();

                    },
                    1000
                );

            } catch (error) {

                console.error(
                    'Project save error:',
                    error
                );

                projectFormStatus.textContent =
                    error.message ||
                    'An error occurred while saving the project.';

                projectFormStatus.className =
                    'status-msg error';

            } finally {

                projectSaveBtn.disabled =
                    false;

                projectSaveBtn.textContent =
                    'Save Project';
            }
        }
    );

    // =========================================================
    // DELETE PROJECT
    // =========================================================
    async function deleteProject(id) {

        if (
            !confirm(
                "Are you sure you want to delete this project?"
            )
        ) {
            return;
        }

        try {

            const {
                error
            } = await supabase
                .from('projects')
                .delete()
                .eq(
                    'id',
                    id
                );

            if (error) {
                throw error;
            }

            loadProjects();

        } catch (error) {

            alert(
                `Error deleting project: ${error.message}`
            );
        }
    }

    // =========================================================
    // CLIENTS MANAGEMENT
    // =========================================================
    const clientsTbody =
        document.getElementById(
            'clients-tbody'
        );

    const clientModal =
        document.getElementById(
            'client-modal'
        );

    const addClientBtn =
        document.getElementById(
            'add-client-btn'
        );

    const clientForm =
        document.getElementById(
            'client-form'
        );

    const clientSaveBtn =
        document.getElementById(
            'client-save-btn'
        );

    const clientFormStatus =
        document.getElementById(
            'client-form-status'
        );

    // =========================================================
    // LOAD CLIENTS
    // =========================================================
    async function loadClients() {

        clientsTbody.innerHTML =
            '<tr><td colspan="3">Loading...</td></tr>';

        const {
            data,
            error
        } = await supabase
            .from('clients')
            .select('*')
            .order(
                'created_at',
                {
                    ascending: false
                }
            );

        if (error) {

            clientsTbody.innerHTML =
                `<tr>
                    <td
                        colspan="3"
                        style="color:var(--danger)"
                    >
                        Error loading clients:
                        ${error.message}
                    </td>
                </tr>`;

            return;
        }

        clientsData =
            data || [];

        renderClients();
    }

    // =========================================================
    // RENDER CLIENTS
    // =========================================================
    function renderClients() {

        clientsTbody.innerHTML = '';

        if (
            clientsData.length === 0
        ) {

            clientsTbody.innerHTML =
                '<tr><td colspan="3">No clients found.</td></tr>';

            return;
        }

        clientsData.forEach(
            c => {

                const tr =
                    document.createElement(
                        'tr'
                    );

                let logoHtml =
                    c.logo_url

                        ? `<img
                            src="${c.logo_url}"
                            class="thumb"
                            style="object-fit: contain;"
                        >`

                        : `<div
                            class="thumb"
                            style="
                                background:#333;
                                display:flex;
                                align-items:center;
                                justify-content:center;
                                font-size:10px;
                            "
                        >
                            No Logo
                        </div>`;

                const statusClass =
                    c.published
                        ? 'published'
                        : 'draft';

                const statusText =
                    c.published
                        ? 'Published'
                        : 'Draft';

                tr.innerHTML = `

                    <td>

                        <div
                            style="
                                display:flex;
                                align-items:center;
                                gap:1rem;
                            "
                        >

                            ${logoHtml}

                            <span>
                                <strong>
                                    ${c.name}
                                </strong>
                            </span>

                        </div>

                    </td>

                    <td>

                        <span
                            class="status-badge ${statusClass}"
                        >
                            ${statusText}
                        </span>

                    </td>

                    <td>

                        <button
                            class="action-btn edit-client"
                            data-id="${c.id}"
                        >
                            <i class="fa-solid fa-pen"></i>
                        </button>

                        <button
                            class="action-btn delete delete-client"
                            data-id="${c.id}"
                        >
                            <i class="fa-solid fa-trash"></i>
                        </button>

                    </td>
                `;

                clientsTbody.appendChild(
                    tr
                );
            }
        );

        document
            .querySelectorAll(
                '.edit-client'
            )
            .forEach(
                btn => {

                    btn.addEventListener(
                        'click',
                        e => {

                            openClientModal(
                                e.currentTarget
                                    .getAttribute(
                                        'data-id'
                                    )
                            );
                        }
                    );
                }
            );

        document
            .querySelectorAll(
                '.delete-client'
            )
            .forEach(
                btn => {

                    btn.addEventListener(
                        'click',
                        e => {

                            deleteClient(
                                e.currentTarget
                                    .getAttribute(
                                        'data-id'
                                    )
                            );
                        }
                    );
                }
            );
    }

    // =========================================================
    // OPEN CLIENT MODAL
    // =========================================================
    addClientBtn.addEventListener(
        'click',
        () => openClientModal()
    );

    function openClientModal(id = null) {

        clientForm.reset();

        clientFormStatus.textContent =
            '';

        clientFormStatus.className =
            'status-msg';

        if (id) {

            const client =
                clientsData.find(
                    c => c.id == id
                );

            if (client) {

                document
                    .getElementById(
                        'client-modal-title'
                    )
                    .textContent =
                    'Edit Client';

                document
                    .getElementById(
                        'client-id'
                    )
                    .value =
                    client.id;

                document
                    .getElementById(
                        'client-name'
                    )
                    .value =
                    client.name || '';

                document
                    .getElementById(
                        'client-link'
                    )
                    .value =
                    client.website_link || '';

                document
                    .getElementById(
                        'client-published'
                    )
                    .checked =
                    client.published;
            }

        } else {

            document
                .getElementById(
                    'client-modal-title'
                )
                .textContent =
                'Add Client';

            document
                .getElementById(
                    'client-id'
                )
                .value =
                '';
        }

        clientModal.classList.add(
            'active'
        );
    }

    // =========================================================
    // SAVE CLIENT
    // =========================================================
    clientForm.addEventListener(
        'submit',
        async (e) => {

            e.preventDefault();

            clientSaveBtn.disabled =
                true;

            clientSaveBtn.textContent =
                'Saving...';

            clientFormStatus.textContent =
                '';

            const id =
                document
                    .getElementById(
                        'client-id'
                    )
                    .value;

            const name =
                document
                    .getElementById(
                        'client-name'
                    )
                    .value;

            const website_link =
                document
                    .getElementById(
                        'client-link'
                    )
                    .value;

            const published =
                document
                    .getElementById(
                        'client-published'
                    )
                    .checked;

            const fileInput =
                document
                    .getElementById(
                        'client-file'
                    );

            try {

                let logo_url = '';

                if (
                    fileInput.files.length > 0
                ) {

                    const file =
                        fileInput.files[0];

                    const fileExt =
                        file.name
                            .split('.')
                            .pop();

                    const fileName =
                        `client_${Math.random()
                            .toString(36)
                            .substring(2, 15)}_${Date.now()}.${fileExt}`;

                    clientFormStatus.textContent =
                        'Uploading client logo to ImageKit...';

                    console.log(
                        'Uploading client logo to ImageKit:',
                        fileName
                    );

                    const imageKitResult =
                        await uploadToImageKit(
                            file,
                            fileName,
                            'clients'
                        );

                    logo_url =
                        imageKitResult.url;
                }

                const clientData = {

                    name,

                    website_link,

                    published
                };

                if (logo_url) {

                    clientData.logo_url =
                        logo_url;
                }

                if (id) {

                    const {
                        error
                    } = await supabase
                        .from('clients')
                        .update(
                            clientData
                        )
                        .eq(
                            'id',
                            id
                        );

                    if (error) {
                        throw error;
                    }

                    clientFormStatus.textContent =
                        'Client updated successfully!';

                } else {

                    const {
                        error
                    } = await supabase
                        .from('clients')
                        .insert([
                            clientData
                        ]);

                    if (error) {
                        throw error;
                    }

                    clientFormStatus.textContent =
                        'Client created successfully!';
                }

                clientFormStatus.className =
                    'status-msg success';

                setTimeout(
                    () => {

                        clientModal
                            .classList
                            .remove('active');

                        loadClients();

                    },
                    1000
                );

            } catch (error) {

                console.error(
                    'Client save error:',
                    error
                );

                clientFormStatus.textContent =
                    error.message;

                clientFormStatus.className =
                    'status-msg error';

            } finally {

                clientSaveBtn.disabled =
                    false;

                clientSaveBtn.textContent =
                    'Save Client';
            }
        }
    );

    // =========================================================
    // DELETE CLIENT
    // =========================================================
    async function deleteClient(id) {

        if (
            !confirm(
                "Are you sure you want to delete this client?"
            )
        ) {
            return;
        }

        try {

            const {
                error
            } = await supabase
                .from('clients')
                .delete()
                .eq(
                    'id',
                    id
                );

            if (error) {
                throw error;
            }

            loadClients();

        } catch (error) {

            alert(
                `Error deleting client: ${error.message}`
            );
        }
    }

    // =========================================================
    // MODAL CLOSE BUTTONS
    // =========================================================
    document
        .querySelectorAll(
            '.close-modal'
        )
        .forEach(
            btn => {

                btn.addEventListener(
                    'click',
                    () => {

                        btn
                            .closest(
                                '.modal'
                            )
                            .classList
                            .remove(
                                'active'
                            );
                    }
                );
            }
        );

    // =========================================================
    // PROFILE PHOTO MANAGEMENT
    // =========================================================
    const profilePhotoForm =
        document.getElementById(
            'profile-photo-form'
        );

    const profileUploadBtn =
        document.getElementById(
            'upload-profile-btn'
        );

    const profileStatus =
        document.getElementById(
            'profile-photo-status'
        );

    if (profilePhotoForm) {

        profilePhotoForm.addEventListener(
            'submit',
            async (e) => {

                e.preventDefault();

                const fileInput =
                    document.getElementById(
                        'profile-photo-upload'
                    );

                if (
                    fileInput.files.length === 0
                ) {

                    profileStatus.textContent =
                        'Please select an image first.';

                    profileStatus.className =
                        'status-msg error';

                    return;
                }

                profileUploadBtn.disabled =
                    true;

                profileUploadBtn.textContent =
                    'Uploading...';

                profileStatus.textContent =
                    '';

                try {

                    const file =
                        fileInput.files[0];

                    const fileExt =
                        file.name
                            .split('.')
                            .pop();

                    const fileName =
                        `profile_${Date.now()}.${fileExt}`;

                    profileStatus.textContent =
                        'Uploading profile photo to ImageKit...';

                    console.log(
                        'Uploading profile photo to ImageKit:',
                        fileName
                    );

                    const imageKitResult =
                        await uploadToImageKit(
                            file,
                            fileName,
                            'profile'
                        );

                    const publicUrl =
                        imageKitResult.url;

                    // Save to settings table
                    const {
                        error: updateError
                    } = await supabase
                        .from('settings')
                        .upsert({
                            id: 1,
                            profile_photo_url:
                                publicUrl
                        });

                    if (
                        updateError
                    ) {
                        throw updateError;
                    }

                    profileStatus.textContent =
                        'Profile photo updated successfully!';

                    profileStatus.className =
                        'status-msg success';

                    profilePhotoForm.reset();

                } catch (error) {

                    console.error(
                        'Profile photo upload error:',
                        error
                    );

                    profileStatus.textContent =
                        error.message;

                    profileStatus.className =
                        'status-msg error';

                } finally {

                    profileUploadBtn.disabled =
                        false;

                    profileUploadBtn.textContent =
                        'Upload & Save Photo';
                }
            }
        );
    }

    // =========================================================
    // START APP
    // =========================================================
    init();

});