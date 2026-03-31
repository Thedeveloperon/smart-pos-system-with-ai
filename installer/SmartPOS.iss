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
DefaultDirName={localappdata}\Lanka POS
DefaultGroupName=Lanka POS
DisableProgramGroupPage=yes
OutputDir={#InstallerOutputDir}
OutputBaseFilename=Lanka POS-Setup-{#AppVersion}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupLogging=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Files]
Source: "{#PackageDir}\\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\\Lanka POS\\Start Lanka POS"; Filename: "{app}\\Start-SmartPOS.bat"; WorkingDir: "{app}"
Name: "{autoprograms}\\Lanka POS\\Stop Lanka POS"; Filename: "{app}\\Stop-SmartPOS.bat"; WorkingDir: "{app}"
Name: "{autodesktop}\\Lanka POS"; Filename: "{app}\\Start-SmartPOS.bat"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\\Start-SmartPOS.bat"; Description: "Launch Lanka POS"; Flags: postinstall nowait skipifsilent shellexec
