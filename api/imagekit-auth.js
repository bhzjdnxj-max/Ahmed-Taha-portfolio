const ImageKit = require("imagekit");

const clean = (val) => (val || "").trim().replace(/^["']|["']$/g, "");

module.exports = async (req, res) => {
    if (req.method !== "GET") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {
        const publicKey = clean(process.env.IMAGEKIT_PUBLIC_KEY);
        const privateKey = clean(process.env.IMAGEKIT_PRIVATE_KEY);
        const urlEndpoint = clean(process.env.IMAGEKIT_URL_ENDPOINT);

        const imagekit = new ImageKit({
            publicKey,
            privateKey,
            urlEndpoint
        });

        const authenticationParameters =
            imagekit.getAuthenticationParameters();

        return res.status(200).json({
            ...authenticationParameters,
            publicKey
        });
    } catch (error) {
        console.error("ImageKit authentication error:", error);
        return res.status(500).json({
            error: "Failed to generate ImageKit authentication"
        });
    }
};