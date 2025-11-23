const forge = require('node-forge');
const fs = require('fs');
const path = require('path');
const os = require('os');

class TLSConfig {
    constructor() {
        this.certDir = path.join(os.homedir(), '.classsend', 'certs');
        this.certPath = path.join(this.certDir, 'server-cert.pem');
        this.keyPath = path.join(this.certDir, 'server-key.pem');
    }

    // Generate self-signed certificate
    generateCertificate() {
        console.log('Generating self-signed certificate...');

        // Generate a keypair
        const keys = forge.pki.rsa.generateKeyPair(2048);

        // Create a certificate
        const cert = forge.pki.createCertificate();
        cert.publicKey = keys.publicKey;
        cert.serialNumber = '01';
        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

        const attrs = [{
            name: 'commonName',
            value: 'ClassSend Server'
        }, {
            name: 'countryName',
            value: 'US'
        }, {
            shortName: 'ST',
            value: 'State'
        }, {
            name: 'localityName',
            value: 'City'
        }, {
            name: 'organizationName',
            value: 'ClassSend'
        }, {
            shortName: 'OU',
            value: 'Development'
        }];

        cert.setSubject(attrs);
        cert.setIssuer(attrs);

        cert.setExtensions([{
            name: 'basicConstraints',
            cA: true
        }, {
            name: 'keyUsage',
            keyCertSign: true,
            digitalSignature: true,
            nonRepudiation: true,
            keyEncipherment: true,
            dataEncipherment: true
        }, {
            name: 'extKeyUsage',
            serverAuth: true,
            clientAuth: true,
            codeSigning: true,
            emailProtection: true,
            timeStamping: true
        }, {
            name: 'subjectAltName',
            altNames: [{
                type: 2, // DNS
                value: 'localhost'
            }, {
                type: 7, // IP
                ip: '127.0.0.1'
            }]
        }]);

        // Self-sign certificate
        cert.sign(keys.privateKey, forge.md.sha256.create());

        // Convert to PEM format
        const pemCert = forge.pki.certificateToPem(cert);
        const pemKey = forge.pki.privateKeyToPem(keys.privateKey);

        return { cert: pemCert, key: pemKey };
    }

    // Save certificate and key to disk
    saveCertificate(cert, key) {
        // Create directory if it doesn't exist
        if (!fs.existsSync(this.certDir)) {
            fs.mkdirSync(this.certDir, { recursive: true });
        }

        fs.writeFileSync(this.certPath, cert);
        fs.writeFileSync(this.keyPath, key);

        console.log(`Certificate saved to ${this.certPath}`);
        console.log(`Private key saved to ${this.keyPath}`);
    }

    // Load existing certificate or generate new one
    getCertificate() {
        if (fs.existsSync(this.certPath) && fs.existsSync(this.keyPath)) {
            console.log('Loading existing certificate...');
            return {
                cert: fs.readFileSync(this.certPath, 'utf8'),
                key: fs.readFileSync(this.keyPath, 'utf8')
            };
        } else {
            console.log('No existing certificate found, generating new one...');
            const { cert, key } = this.generateCertificate();
            this.saveCertificate(cert, key);
            return { cert, key };
        }
    }

    // Get credentials for HTTPS server
    getCredentials() {
        const { cert, key } = this.getCertificate();
        return { cert, key };
    }
}

module.exports = TLSConfig;
