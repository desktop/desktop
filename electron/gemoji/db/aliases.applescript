set jsCode to "document.getElementById('output').value"
set json to missing value

tell application "Safari"
  repeat
    set json to (do JavaScript jsCode in current tab of window 1)
    if (json is not missing value) then exit repeat
    delay 0.5
  end repeat
  close current tab of window 1
end tell

return json
