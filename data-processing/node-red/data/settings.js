module.exports = {
    flowFile: 'flows.json',
    credentialSecret: false,
    uiPort: process.env.PORT || 1880,
    diagnostics: { enabled: true, ui: true },
    functionGlobalContext: {
        fs: require('fs')
    },
    logging: {
        console: {
            level: "info",
            metrics: false,
            audit: false
        }
    },
    editorTheme: {
        projects: { enabled: false }
    }
};
