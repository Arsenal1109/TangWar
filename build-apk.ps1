param(
    [string]$CreatorPath = 'C:\ProgramData\cocos\editors\Creator\3.8.8\CocosCreator.exe',
    [string]$GradleHome = 'D:\Gradle\gradle-8.11.1',
    # 产出 Play 商店所需的 .aab（默认 false 产出 APK；上架 Google Play 用 -AAB）
    [switch]$AAB
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = $PSScriptRoot
$gradleBin = Join-Path $GradleHome 'bin\gradle.bat'
$androidProject = Join-Path $projectRoot 'build\android\proj'
$buildLog = Join-Path $projectRoot 'temp\builder\log\android-release.log'
$apkDir = Join-Path $androidProject 'build\CocosGame\outputs\apk\release'
$aabDir = Join-Path $androidProject 'build\CocosGame\outputs\bundle\release'
$signingFile = Join-Path $projectRoot 'signing.properties'

if (-not (Test-Path -LiteralPath $CreatorPath -PathType Leaf)) {
    throw "未找到 Cocos Creator：$CreatorPath"
}
if (-not (Test-Path -LiteralPath $gradleBin -PathType Leaf)) {
    throw "未找到固定 Gradle 8.11.1：$gradleBin"
}

# ---- 签名配置：signing.properties 或 TANGWAR_RELEASE_* 环境变量（可选，缺省出未签名包） ----
$signingArgs = @()
if (Test-Path -LiteralPath $signingFile -PathType Leaf) {
    Get-Content -LiteralPath $signingFile | ForEach-Object {
        if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.+)\s*$') { Set-Variable -Name $Matches[1] -Value $Matches[2] }
    }
    Write-Host "已读取签名配置：$signingFile"
} elseif ($env:TANGWAR_RELEASE_STORE_FILE) {
    Set-Variable -Name RELEASE_STORE_FILE -Value $env:TANGWAR_RELEASE_STORE_FILE
    Set-Variable -Name RELEASE_STORE_PASSWORD -Value $env:TANGWAR_RELEASE_STORE_PASSWORD
    Set-Variable -Name RELEASE_KEY_ALIAS -Value $env:TANGWAR_RELEASE_KEY_ALIAS
    Set-Variable -Name RELEASE_KEY_PASSWORD -Value $env:TANGWAR_RELEASE_KEY_PASSWORD
    Write-Host '已从环境变量读取签名配置（TANGWAR_RELEASE_*）'
}
if (Get-Variable -Name RELEASE_STORE_FILE -ValueOnly -ErrorAction SilentlyContinue) {
    $signingArgs = @(
        "-PRELEASE_STORE_FILE=$RELEASE_STORE_FILE",
        "-PRELEASE_STORE_PASSWORD=$RELEASE_STORE_PASSWORD",
        "-PRELEASE_KEY_ALIAS=$RELEASE_KEY_ALIAS",
        "-PRELEASE_KEY_PASSWORD=$RELEASE_KEY_PASSWORD"
    )
    Write-Host "签名生效：keystore=$RELEASE_STORE_FILE alias=$RELEASE_KEY_ALIAS"
} else {
    Write-Warning '未配置签名（signing.properties / TANGWAR_RELEASE_*）：将产出未签名包，仅供安装测试，不可上架。'
}

# Gradle 属性须放在任务名之前
$gradleTask = if ($AAB) { ':CocosGame:bundleRelease' } else { ':CocosGame:assembleRelease' }

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
    & $gradleBin @signingArgs $gradleTask '--no-daemon'
    $gradleExit = $LASTEXITCODE
    if ($gradleExit -ne 0) {
        # Windows 偶尔会因 Gradle 文件锁通信端口残留而首次启动失败。
        # 停止残留 daemon 后仅重试 Gradle 步骤，不重复生成 Android 工程。
        Write-Warning "Gradle 首次执行失败（退出码 $gradleExit），清理 daemon 后自动重试一次。"
        & $gradleBin '--stop'
        & $gradleBin @signingArgs $gradleTask '--no-daemon'
        $gradleExit = $LASTEXITCODE
    }
    if ($gradleExit -ne 0) {
        throw "Gradle 打包失败（退出码 $gradleExit）"
    }
}
finally {
    Pop-Location
}

if ($AAB) {
    $aab = Get-ChildItem -LiteralPath $aabDir -Filter '*.aab' -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $aab) {
        throw "Gradle 已结束，但未在此目录发现 AAB：$aabDir"
    }
    Write-Host "AAB 构建完成（可直接上传 Play Console）：$($aab.FullName)"
    Get-Item -LiteralPath $aab.FullName | Select-Object FullName, Length, LastWriteTime
    return
}

$apk = Get-ChildItem -LiteralPath $apkDir -Filter '*.apk' -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $apk) {
    throw "Gradle 已结束，但未在此目录发现 APK：$apkDir"
}

Write-Host "APK 构建完成：$($apk.FullName)"
Get-Item -LiteralPath $apk.FullName | Select-Object FullName, Length, LastWriteTime
