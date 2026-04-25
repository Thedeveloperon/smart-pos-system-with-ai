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
Source: "{#PackageDir}\\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\\Lanka POS\\Open Lanka POS"; Filename: "{app}\\Start-SmartPOS.bat"; WorkingDir: "{app}"; Check: not IsAdminInstallMode
Name: "{autoprograms}\\Lanka POS\\Stop Lanka POS"; Filename: "{app}\\Stop-SmartPOS.bat"; WorkingDir: "{app}"; Check: not IsAdminInstallMode
Name: "{autoprograms}\\Lanka POS\\Generate Offline Activation Codes"; Filename: "{app}\\Activation-Code-Manager.bat"; WorkingDir: "{app}"; Check: not IsAdminInstallMode
Name: "{autodesktop}\\Lanka POS"; Filename: "{app}\\Start-SmartPOS.bat"; WorkingDir: "{app}"; Tasks: desktopicon; Check: not IsAdminInstallMode

[Run]
Filename: "{sys}\\WindowsPowerShell\\v1.0\\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\\Setup-CurrentUser-Install.ps1"""; StatusMsg: "Preparing Lanka POS current-user data..."; Flags: waituntilterminated; Check: not IsAdminInstallMode
Filename: "{app}\\Install-SmartPOS-Service.bat"; StatusMsg: "Configuring Lanka POS Windows service..."; Flags: waituntilterminated; Check: IsAdminInstallMode
Filename: "{app}\\Start-SmartPOS.bat"; Description: "Launch Lanka POS"; Flags: postinstall nowait skipifsilent shellexec; Check: not IsAdminInstallMode
Filename: "{app}\\Start-SmartPOS.bat"; Description: "Open Lanka POS"; Flags: postinstall nowait skipifsilent shellexec runasoriginaluser; Check: IsAdminInstallMode

[Code]
function GetDefaultDirName(Param: String): String;
begin
  if IsAdminInstallMode then
    Result := ExpandConstant('{commonpf}\Lanka POS')
  else
    Result := ExpandConstant('{localappdata}\Lanka POS');
end;
