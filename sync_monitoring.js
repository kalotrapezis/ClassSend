const fs = require('fs');

const clientHtml = 'client/index.html';
const serverHtml = 'server/public/index.html';

const t1_client = '<!-- Monitoring Section -->';
const t1_server = '<!-- Monitoring Section under Streaming Settings -->';
const t2 = '<!-- Content Moderation Page (Teacher Only) -->';

let c1 = fs.readFileSync(clientHtml, 'utf8');
let sHtml = fs.readFileSync(serverHtml, 'utf8');

let startClient = c1.indexOf(t1_client);
let endClient = c1.indexOf(t2, startClient);

let startServer = sHtml.indexOf(t1_server);
let endServer = sHtml.indexOf('</div>', sHtml.indexOf(t2, startServer) - 50); // Be careful, better to match up to t2
endServer = sHtml.indexOf('</div>\r\n\r\n                <!-- Content Moderation Page (Teacher Only) -->', startServer);
if (endServer === -1) {
    endServer = sHtml.indexOf('</div>\n\n                <!-- Content Moderation Page (Teacher Only) -->', startServer);
}
if (endServer === -1) {
    console.log("Could not find end in server HTML. Using t2.");
    endServer = sHtml.lastIndexOf('</div>', sHtml.indexOf(t2, startServer));
}


if (startClient > 0 && endClient > 0 && startServer > 0 && endServer > 0) {
    let extracted = c1.substring(startClient, endClient);

    // ensure we don't accidentally chop off the closing </div> of the streaming page
    // The client extracted part ends with </div>\r\n\r\n
    // So if we replace startServer to endServer+6 we should be good.

    let newServerHtml = sHtml.substring(0, startServer) + extracted + sHtml.substring(endServer + 6);
    fs.writeFileSync(serverHtml, newServerHtml);
    console.log("Successfully copied Monitoring UI from client to server");
} else {
    console.log("Failed to find boundaries", startClient, endClient, startServer, endServer);
}
