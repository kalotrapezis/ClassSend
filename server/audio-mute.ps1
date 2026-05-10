# audio-mute.ps1
# Set the default audio endpoint master mute state deterministically.
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File audio-mute.ps1 true|false
#
# Uses the Windows Core Audio API via inline C#. No external dependencies.
# Returns a non-zero exit code on failure so the Electron caller can surface it.

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('true', 'false', '1', '0', 'on', 'off')]
    [string]$Mute
)

$ErrorActionPreference = 'Stop'
$muteFlag = $Mute -in @('true', '1', 'on')

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr p);
    int UnregisterControlChangeNotify(IntPtr p);
    int GetChannelCount(out uint c);
    int SetMasterVolumeLevel(float v, Guid g);
    int SetMasterVolumeLevelScalar(float v, Guid g);
    int GetMasterVolumeLevel(out float v);
    int GetMasterVolumeLevelScalar(out float v);
    int SetChannelVolumeLevel(uint c, float v, Guid g);
    int SetChannelVolumeLevelScalar(uint c, float v, Guid g);
    int GetChannelVolumeLevel(uint c, out float v);
    int GetChannelVolumeLevelScalar(uint c, out float v);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, Guid g);
    int GetMute(out bool m);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice {
    int Activate(ref Guid id, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator {
    int Reserved();
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ep);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class MMDeviceEnumeratorComObject { }

public static class ClassSendAudio {
    public static void SetMute(bool mute) {
        var de = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
        IMMDevice dev;
        de.GetDefaultAudioEndpoint(0, 1, out dev); // 0 = render, 1 = multimedia
        var iid = typeof(IAudioEndpointVolume).GUID;
        object epv;
        dev.Activate(ref iid, 7, IntPtr.Zero, out epv); // 7 = CLSCTX_ALL
        ((IAudioEndpointVolume)epv).SetMute(mute, Guid.Empty);
    }
}
"@ -ErrorAction Stop | Out-Null

try {
    [ClassSendAudio]::SetMute($muteFlag)
    Write-Output ("OK mute=" + $muteFlag)
    exit 0
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
