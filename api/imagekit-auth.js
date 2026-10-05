const ImageKit = require("imagekit");

const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

module.exports = async (req, res) => {

    if (req.method !== "GET") {

        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {

        const authenticationParameters =
            imagekit.getAuthenticationParameters();

        return res.status(200).json({

            ...authenticationParameters,

            publicKey:
                process.env.IMAGEKIT_PUBLIC_KEY

        });

    } catch (error) {

        console.error(
            "ImageKit authentication error:",
            error
        );

        return res.status(500).json({
            error:
                "Failed to generate ImageKit authentication"
        });
    }
};