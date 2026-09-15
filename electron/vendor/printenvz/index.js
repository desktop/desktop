const path = require('path');
const os = require('os');

/**
 * Returns the path to the compiled native printenvz executable
 * 
 * @returns {string} The absolute path to the printenvz executable
 */
function getPrintenvzPath() {
    const platform = os.platform();
    const buildDir = path.join(__dirname, 'build', 'Release');
    
    let executableName = 'printenvz';
    if (platform === 'win32') {
        executableName += '.exe';
    }
    
    return path.join(buildDir, executableName);
}

module.exports = {
    getPrintenvzPath
};
