#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

#ifndef PackageDir
  #define PackageDir "..\\release\\lanka-pos-win-x64"
#endif

#ifndef InstallerOutputDir
  #define InstallerOutputDir "..\\release\\installer"
#endif

[Setup]
AppId={{4B4B5F4D-25D5-4BC2-A3D6-5A0E56A9C5A6}
AppName=Lanka POS
AppVersion={#AppVersion}
AppPublisher=Lanka POS
DefaultDirName={code:GetDefaultDirName}
DefaultGroupName=Lanka POS
DisableProgramGroupPage=yes
OutputDir={#InstallerOutputDir}
OutputBaseFilename=Lanka POS-Setup-{#AppVersion}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
UsePreviousPrivileges=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupLogging=yes
CloseApplications=yes
#ifdef SignTool
SignTool={#SignTool}
SignedUninstaller=yes
#endif

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Files]
Source: "{#PackageDir}\\app\\*"; DestDir: "{app}\\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#PackageDir}\\Activation-Code-Manager.bat"; DestDir: "{app}\\tools\\internal"; Flags: ignoreversion
Source: "{#PackageDir}\\Activation-Code-Manager.ps1"; DestDir: "{app}\\tools\\internal"; Flags: ignoreversion
Source: "{#PackageDir}\\Generate-Offline-Activation-Codes.bat"; DestDir: "{app}\\tools\\internal"; Flags: ignoreversion
Source: "{#PackageDir}\\Generate-Offline-Activation-Codes.ps1"; DestDir: "{app}\\tools\\internal"; Flags: ignoreversion
Source: "{#PackageDir}\\Install-SmartPOS-Service.bat"; DestDir: "{app}\\tools\\internal"; Flags: ignoreversion
Source: "{#PackageDir}\\Install-SmartPOS-Service.ps1"; DestDir: "{app}\\tools\\internal"; Flags: ignoreversion
Source: "{#PackageDir}\\Precheck-SmartPOS-Host.bat"; DestDir: "{app}\\tools\\internal"; Flags: ignoreversion
Source: "{#PackageDir}\\Precheck-SmartPOS-Host.ps1"; DestDir: "{app}\\tools\\internal"; Flags: ignoreversion
Source: "{#PackageDir}\\Setup-CurrentUser-Install.ps1"; DestDir: "{app}\\tools\\internal"; Flags: ignoreversion
Source: "{#PackageDir}\\SmartPOS-ClientCommon.ps1"; DestDir: "{app}\\tools\\internal"; Flags: ignoreversion
Source: "{#PackageDir}\\Start-SmartPOS.bat"; DestDir: "{app}\\tools\\internal"; Flags: ignoreversion
Source: "{#PackageDir}\\Start-SmartPOS.ps1"; DestDir: "{app}\\tools\\internal"; Flags: ignoreversion
Source: "{#PackageDir}\\Stop-SmartPOS.bat"; DestDir: "{app}\\tools\\internal"; Flags: ignoreversion
Source: "{#PackageDir}\\Uninstall-SmartPOS-Service.bat"; DestDir: "{app}\\tools\\internal"; Flags: ignoreversion
Source: "{#PackageDir}\\Uninstall-SmartPOS-Service.ps1"; DestDir: "{app}\\tools\\internal"; Flags: ignoreversion
Source: "{#PackageDir}\\client.env.example"; DestDir: "{app}\\tools\\support"; Flags: ignoreversion
Source: "{#PackageDir}\\README-CLIENT.txt"; DestDir: "{app}\\tools\\support"; Flags: ignoreversion
Source: "{#PackageDir}\\lanka-pos.ico"; DestDir: "{app}\\tools\\support"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\\Lanka POS\\Open Lanka POS"; Filename: "{app}\\tools\\internal\\Start-SmartPOS.bat"; WorkingDir: "{app}"; IconFilename: "{app}\\tools\\support\\lanka-pos.ico"; Check: not IsAdminInstallMode
Name: "{autoprograms}\\Lanka POS\\Stop Lanka POS"; Filename: "{app}\\tools\\internal\\Stop-SmartPOS.bat"; WorkingDir: "{app}"; IconFilename: "{app}\\tools\\support\\lanka-pos.ico"; Check: not IsAdminInstallMode
Name: "{autoprograms}\\Lanka POS\\Generate Offline Activation Codes"; Filename: "{app}\\tools\\internal\\Activation-Code-Manager.bat"; WorkingDir: "{app}"; IconFilename: "{app}\\tools\\support\\lanka-pos.ico"; Check: not IsAdminInstallMode
Name: "{autodesktop}\\Lanka POS"; Filename: "{app}\\tools\\internal\\Start-SmartPOS.bat"; WorkingDir: "{app}"; IconFilename: "{app}\\tools\\support\\lanka-pos.ico"; Tasks: desktopicon; Check: not IsAdminInstallMode

[Run]
Filename: "{sys}\\WindowsPowerShell\\v1.0\\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\\tools\\internal\\Setup-CurrentUser-Install.ps1"""; StatusMsg: "Preparing Lanka POS current-user data..."; Flags: waituntilterminated; Check: not IsAdminInstallMode
Filename: "{app}\\tools\\internal\\Install-SmartPOS-Service.bat"; StatusMsg: "Configuring Lanka POS Windows service..."; Flags: waituntilterminated; Check: IsAdminInstallMode
Filename: "{app}\\tools\\internal\\Start-SmartPOS.bat"; Description: "Launch Lanka POS"; Flags: postinstall nowait skipifsilent shellexec; Check: not IsAdminInstallMode
Filename: "{app}\\tools\\internal\\Start-SmartPOS.bat"; Description: "Open Lanka POS"; Flags: postinstall nowait skipifsilent shellexec runasoriginaluser; Check: IsAdminInstallMode

[Code]
function GetDefaultDirName(Param: String): String;
begin
  if IsAdminInstallMode then
    Result := ExpandConstant('{commonpf}\Lanka POS')
  else
    Result := ExpandConstant('{localappdata}\Lanka POS');
end;
