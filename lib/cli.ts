export type CliPlatform = "windows" | "mac" | "linux" | "android";

export interface CliTranslation {
  platform: CliPlatform;
  label: string;
  command: string;
  note?: string;
}

const PLATFORM_META: Record<CliPlatform, { label: string; shell: string }> = {
  windows: { label: "Windows", shell: "PowerShell" },
  mac: { label: "macOS", shell: "bash/zsh" },
  linux: { label: "Linux", shell: "bash" },
  android: { label: "Android", shell: "Termux" },
};

export function translateCliCommand(command: string): CliTranslation[] {
  const raw = command.trim();
  if (!raw) return [];

  const lower = raw.toLowerCase();
  const base = stripPromptPrefix(raw);

  const windows = translateToWindows(base, lower);
  const unix = translateToUnix(base, lower);
  const android = translateToAndroid(base, lower);

  return [windows, unix.mac, unix.linux, android].filter(Boolean) as CliTranslation[];
}

function stripPromptPrefix(command: string): string {
  return command.replace(/^(ps\s*>|\$|#|>)\s*/i, "").trim();
}

function translateToWindows(command: string, lower: string): CliTranslation {
  if (lower === "clear") return { platform: "windows", label: "Windows · PowerShell", command: "Clear-Host" };
  if (lower === "pwd") return { platform: "windows", label: "Windows · PowerShell", command: "Get-Location" };
  if (lower === "ls" || lower.startsWith("ls ")) {
    return {
      platform: "windows",
      label: "Windows · PowerShell",
      command: `Get-ChildItem${command.length > 2 ? ` ${command.slice(2).trim()}` : ""}`.trim(),
    };
  }
  if (lower === "dir") return { platform: "windows", label: "Windows · PowerShell", command: "Get-ChildItem" };
  if (lower.startsWith("cd ")) return { platform: "windows", label: "Windows · PowerShell", command: `Set-Location ${command.slice(3).trim()}` };
  if (lower.startsWith("mkdir ")) return { platform: "windows", label: "Windows · PowerShell", command: `New-Item -ItemType Directory -Path ${command.slice(6).trim()}` };
  if (lower.startsWith("touch ")) return { platform: "windows", label: "Windows · PowerShell", command: `New-Item -ItemType File -Path ${command.slice(6).trim()}` };
  if (lower.startsWith("cat ")) return { platform: "windows", label: "Windows · PowerShell", command: `Get-Content ${command.slice(4).trim()}` };
  if (lower.startsWith("rm ")) return { platform: "windows", label: "Windows · PowerShell", command: `Remove-Item ${command.slice(3).trim()} -Recurse -Force` };
  if (lower.startsWith("cp ")) return { platform: "windows", label: "Windows · PowerShell", command: `Copy-Item ${command.slice(3).trim()}` };
  if (lower.startsWith("mv ")) return { platform: "windows", label: "Windows · PowerShell", command: `Move-Item ${command.slice(3).trim()}` };
  if (lower.startsWith("grep ")) return { platform: "windows", label: "Windows · PowerShell", command: `Select-String ${command.slice(5).trim()}` };
  if (lower.startsWith("curl ")) return { platform: "windows", label: "Windows · PowerShell", command: `Invoke-WebRequest ${command.slice(5).trim()}` };
  if (lower.startsWith("wget ")) return { platform: "windows", label: "Windows · PowerShell", command: `Invoke-WebRequest ${command.slice(5).trim()}` };
  if (lower.startsWith("find ")) return { platform: "windows", label: "Windows · PowerShell", command: `Get-ChildItem -Recurse ${command.slice(5).trim()}` };
  return { platform: "windows", label: "Windows · PowerShell", command };
}

function translateToUnix(command: string, lower: string): { mac: CliTranslation; linux: CliTranslation } {
  const shellLabel = (platform: CliPlatform) => `${PLATFORM_META[platform].label} · ${PLATFORM_META[platform].shell}`;
  const same = (platform: CliPlatform, note?: string): CliTranslation => ({ platform, label: shellLabel(platform), command, note });

  const unixCommand = command
    .replace(/\\/g, "/")
    .replace(/Get-ChildItem/i, "ls")
    .replace(/Get-Location/i, "pwd")
    .replace(/Set-Location/i, "cd")
    .replace(/New-Item -ItemType Directory -Path/i, "mkdir -p")
    .replace(/New-Item -ItemType File -Path/i, "touch")
    .replace(/Get-Content/i, "cat")
    .replace(/Remove-Item/i, "rm -rf")
    .replace(/Copy-Item/i, "cp -r")
    .replace(/Move-Item/i, "mv")
    .replace(/Select-String/i, "grep -n")
    .replace(/Invoke-WebRequest/i, "curl -L")
    .replace(/Invoke-RestMethod/i, "curl -L")
    .trim();

  const macBase = command === lower ? unixCommand : unixCommand;
  const linuxBase = unixCommand;

  return {
    mac: { platform: "mac", label: shellLabel("mac"), command: macBase, note: "Run in Terminal on macOS." },
    linux: { platform: "linux", label: shellLabel("linux"), command: linuxBase, note: "Run in Bash, Zsh, or any GNU shell." },
  };
}

function translateToAndroid(command: string, lower: string): CliTranslation {
  if (lower.startsWith("apt ") || lower.startsWith("apt-get ")) {
    return {
      platform: "android",
      label: "Android · Termux",
      command,
      note: "Works in Termux; install packages with pkg if needed.",
    };
  }
  if (lower.startsWith("pkg ")) return { platform: "android", label: "Android · Termux", command, note: "Termux package manager command." };
  const unix = translateToUnix(command, lower).linux.command;
  return { platform: "android", label: "Android · Termux", command: unix, note: "Most Linux shell commands work in Termux." };
}
