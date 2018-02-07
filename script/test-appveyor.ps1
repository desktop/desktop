mkdir test-reports

yarn test:unit --reporter xunit --reporter-options output=test-reports\unit.xml
if ($LASTEXITCODE -ne "0") {
  set APPVEYOR_TEST_RESULT=$LASTEXITCODE
} else {
  yarn test:integration --reporter xunit --reporter-options output=test-reports\integration.xml
  set APPVEYOR_TEST_RESULT=$LASTEXITCODE
}

$wc = New-Object 'System.Net.WebClient'
$wc.UploadFile("https://ci.appveyor.com/api/testresults/xunit/$($env:APPVEYOR_JOB_ID)", (Resolve-Path .\test-reports\unit.xml))
$wc.UploadFile("https://ci.appveyor.com/api/testresults/xunit/$($env:APPVEYOR_JOB_ID)", (Resolve-Path .\test-reports\integration.xml))
