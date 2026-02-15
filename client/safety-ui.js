
// ==========================================
// SAFETY UI UNLOCK
// ==========================================
// This ensures the user never sees a permanent blank screen if auto-flow fails.
setTimeout(() => {
    const isRoleSelectionVisible = !roleSelection.classList.contains('hidden');
    const isAvailableClassesVisible = !availableClassesScreen.classList.contains('hidden');
    const isChatVisible = !chatInterface.classList.contains('hidden');
    const isSetupVisible = !classSetup.classList.contains('hidden');

    // If ALL screens are hidden
    if (!isRoleSelectionVisible && !isAvailableClassesVisible && !isChatVisible && !isSetupVisible) {
        console.warn("⚠️ Safety UI Unlock: All screens were hidden! Forcing UI to show.");

        if (currentClassId && currentClassId !== 'Lobby') {
            // If we remember a class, we probably should have joined it. 
            // But if we are here, we probably failed.
            // Let's try to show the available classes screen as a fallback.
            availableClassesScreen.classList.remove('hidden');
            renderAvailableClasses();
            showToast("Restored session (Safety Unlock)", "info");
        } else if (savedRole === 'student') {
            // Default for student -> Show Available Classes
            availableClassesScreen.classList.remove('hidden');
            renderAvailableClasses();
        } else {
            // Default fallback -> Role Selection
            roleSelection.classList.remove('hidden');
        }
    }
}, 2000); // 2 second safety timeout
