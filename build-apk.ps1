param(
    [string]$CreatorPath = 'C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe',
    [string]$GradleHome = 'D:\Gradle\gradle-8.11.1'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = $PSScriptRoot
$gradleBin = Join-Path $GradleHome 'bin\gradle.bat'
$androidProject = Join-Path $projectRoot 'build\android\proj'
$buildLog = Join-Path $projectRoot 'temp\builder\log\android-release.log'
$apkDir = Join-Path $androidProject 'build\CocosGame\outputs\apk\release'

if (-not (Test-Path -LiteralPath $CreatorPath -PathType Leaf)) {
    throw "未找到 Cocos Creator：$CreatorPath"
}
if (-not (Test-Path -LiteralPath $gradleBin -PathType Leaf)) {
    throw "未找到固定 Gradle 8.11.1：$gradleBin"
}

Write-Host "[1/2] Cocos Creator 生成 Android 工程"
$buildSpec = 'platform=android;debug=false;buildPath=project://build;outputName=android;stage=build;logDest=project://temp/builder/log/android-release.log'
$creator = Start-Process -FilePath $CreatorPath -ArgumentList @(
    '--project', $projectRoot,
    '--build', $buildSpec
) -Wait -PassThru -WindowStyle Hidden

# Creator 命令行在 3.8.8 中成功构建通常返回 36；同时兼容标准成功码 0。
if ($creator.ExitCode -notin @(0, 36)) {
    throw "Cocos Android 工程生成失败（退出码 $($creator.ExitCode)），日志：$buildLog"
}
if (-not (Test-Path -LiteralPath $androidProject -PathType Container)) {
    throw "Android 工程未生成：$androidProject"
}

Write-Host "[2/2] 使用固定 Gradle 打包：$gradleBin"
Push-Location $androidProject
try {
    & $gradleBin ':CocosGame:assembleRelease' '--no-daemon'
    $gradleExit = $LASTEXITCODE
    if ($gradleExit -ne 0) {
        # Windows 偶尔会因 Gradle 文件锁通信端口残留而首次启动失败。
        # 停止残留 daemon 后仅重试 Gradle 步骤，不重复生成 Android 工程。
        Write-Warning "Gradle 首次执行失败（退出码 $gradleExit），清理 daemon 后自动重试一次。"
        & $gradleBin '--stop'
        & $gradleBin ':CocosGame:assembleRelease' '--no-daemon'
        $gradleExit = $LASTEXITCODE
    }
    if ($gradleExit -ne 0) {
        throw "Gradle 打包失败（退出码 $gradleExit）"
    }
}
finally {
    Pop-Location
}

$apk = Get-ChildItem -LiteralPath $apkDir -Filter '*.apk' -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $apk) {
    throw "Gradle 已结束，但未在此目录发现 APK：$apkDir"
}

Write-Host "APK 构建完成：$($apk.FullName)"
Get-Item -LiteralPath $apk.FullName | Select-Object FullName, Length, LastWriteTime
