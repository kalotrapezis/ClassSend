// Content Filtering Module
// Add this to the end of main.js

// Load filter words on startup
let filterWords = [];
let flaggedUsers = new Set();
let currentUserFlagged = false;

fetch('/filter-words.json')
    .then(response => response.json())
    .then(words => {
        filterWords = words.map(w => w.toLowerCase());
        console.log(`✅ Loaded ${filterWords.length} filter words`);
    })
    .catch(err => console.error('Failed to load filter words:', err));

// Check if text contains inappropriate words
function containsInappropriateContent(text) {
    if (!text || filterWords.length === 0) return false;

    const lowerText = text.toLowerCase();

    // Check for whole word matches
    return filterWords.some(word => {
        // Use word boundaries to match whole words
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        return regex.test(lowerText);
    });
}

// Real-time input monitoring
messageInput.addEventListener('input', () => {
    const hasInappropriate = containsInappropriateContent(messageInput.value);

    if (hasInappropriate) {
        // Disable send button
        btnSendMessage.disabled = true;
        btnSendMessage.style.opacity = '0.5';
        btnSendMessage.style.cursor = 'not-allowed';

        // Show warning
        filterWarning.classList.remove('hidden');

        // Add red border to input
        messageInput.style.borderColor = '#ef4444';

        // Flag current user if not already flagged
        if (!currentUserFlagged) {
            currentUserFlagged = true;
            flaggedUsers.add(socket.id);

            // Broadcast flag to all users
            socket.emit('user-flagged', {
                classId: currentClassId,
                userId: socket.id,
                userName: userName
            });

            console.warn('⚠️ User flagged for inappropriate content');
        }
    } else {
        // Enable send button
        btnSendMessage.disabled = false;
        btnSendMessage.style.opacity = '1';
        btnSendMessage.style.cursor = 'pointer';

        // Hide warning
        filterWarning.classList.add('hidden');

        // Remove red border
        messageInput.style.borderColor = '';
    }
});

// Listen for flagged users from server
socket.on('user-was-flagged', ({ userId, userName }) => {
    flaggedUsers.add(userId);
    renderUsersList(); // Re-render to show flags
});

// Update renderUsersList to show flags
const originalRenderUsersList = renderUsersList;
renderUsersList = function () {
    originalRenderUsersList();

    // Add flags to flagged users
    if (!currentClassId || !joinedClasses.has(currentClassId)) return;

    const users = joinedClasses.get(currentClassId).users;
    users.forEach(user => {
        if (flaggedUsers.has(user.id)) {
            const userItems = usersList.querySelectorAll('.user-item');
            userItems.forEach(item => {
                const nameEl = item.querySelector('.user-name');
                if (nameEl && nameEl.textContent === user.name && !nameEl.textContent.includes('🚩')) {
                    nameEl.textContent = '🚩 ' + nameEl.textContent;
                }
            });
        }
    });
};

// Update renderMessage to show flags in message headers
const originalRenderMessage = renderMessage;
renderMessage = function (message) {
    originalRenderMessage(message);

    // Add flag to message sender if they're flagged
    if (message.senderId && flaggedUsers.has(message.senderId)) {
        const lastMessage = messagesContainer.lastElementChild;
        if (lastMessage) {
            const senderEl = lastMessage.querySelector('.message-sender');
            if (senderEl && !senderEl.textContent.includes('🚩')) {
                senderEl.textContent = '🚩 ' + senderEl.textContent;
            }
        }
    }
};
