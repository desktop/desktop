---
---

class Choosealicense
  # Selects the content of a given element
  selectText: (element) ->
    if document.body.createTextRange
      range = document.body.createTextRange()
      range.moveToElementText(element)
      range.select()
    else if window.getSelection
      selection = window.getSelection()
      range = document.createRange()

      range.selectNodeContents(element)
      selection.removeAllRanges()
      selection.addRange(range)

  tooltipAttributesMapperByRuleType:
    permissions:
      heading: 'Permission'
      color: 'tooltip--permissions'
    conditions:
      heading: 'Condition'
      color: 'tooltip--conditions'
    limitations:
      heading: 'Limitation'
      color: 'tooltip--limitations'


  # fire on document.ready
  constructor: ->
    @initTooltips()
    @initClipboard()
    @initLicenseSuggestion()

  # Init tooltip action
  initTooltips: ->

    # Dynamically add annotations as title attribute to rule list items
    for ruletype, rules of window.annotations
      for rule in rules
        licenseLiElement = $(".license-#{ruletype} .#{rule["tag"]}")
        tooltipAttr = @tooltipAttributesMapperByRuleType[ruletype]
        licenseLiElement.attr "aria-label", "#{tooltipAttr.heading}: #{rule.description}"
        licenseLiElement.addClass("hint--bottom
                                   hint--large
                                   hint--no-animate
                                   #{tooltipAttr.color}
                                   orverride-hint-inline")

  # Initializes Clipboard.js
  initClipboard: ->
    # Backup the clipboard button's original text.
    $(".js-clipboard-button").data "clipboard-prompt", $(".js-clipboard-button").text()

    # Hook up copy to clipboard buttons
    clip = new Clipboard ".js-clipboard-button"
    clip.on "mouseout", @clipboardMouseout
    clip.on "complete", @clipboardComplete

  # Callback to restore the clipboard button's original text
  clipboardMouseout: (client, args) ->
    @textContent = $(this).data("clipboard-prompt")

  # Post-copy user feedback callback
  clipboardComplete: (client, args) ->
    @textContent = "Copied!"

  # Initializes the repository suggestion feature
  initLicenseSuggestion: ->
    inputEl = $("#repository-url")
    licenseId = inputEl.attr("data-license-id")
    statusIndicator = $(".status-indicator")
    new LicenseSuggestion(inputEl, licenseId, statusIndicator)

class LicenseSuggestion
  constructor: (@inputEl, @licenseId, @statusIndicator) ->
    @bindEventHandlers()

  inputWraper: $('.input-wrapper')
  tooltipErrorClasses: 'hint--bottom tooltip--error hint--always'

  # Main event handlers for user input
  bindEventHandlers: =>
    @inputEl.on "input", (event) =>
      @setStatus ""
    .on "keyup", (event) =>
      if event.keyCode == 13 and event.target.value
        # Validate the user input first
        try
          repositoryFullName = @parseUserInput event.target.value
        catch
          @setStatus "Error", "Invalid URL."
          return

        @setStatus "Fetching"
        @fetchInfoFromGithubAPI repositoryFullName, (err, repositoryInfo=null) =>
          if (err)
            @setStatus "Error", err.message
            return
          if repositoryInfo.license # The repository already has a license
            license = repositoryInfo.license
            @setStatus "Error", @repositoryLicense repositoryFullName, license
          else # The repository is not licensed
            licenseUrl = encodeURIComponent "https://github.com/#{repositoryFullName}/community/license/new?template=#{@licenseId}"
            # Provide the chance to the user log-in, since the URL to suggest a license is restricted
            window.location.href = "https://github.com/login?return_to=#{licenseUrl}"
            @setStatus ""
            @inputEl.val("")

  # Try to extract the repository full name from the user input
  parseUserInput: (userInput) ->
    repository = /https?:\/\/github\.com\/(.*?)\/(.+)(\.git)?$/.exec userInput
    [_, username, project] = repository
    project = project
      .split /\/|\.git/
      .filter (str) -> str
      .slice 0, 1
      .join ""
    return username + '/' + project

  # Displays an indicator and tooltips to the user about the current status
  setStatus: (status="", message="") =>
    statusClass = status.toLowerCase()
    displayTooltip = (status, message) =>
      @inputWraper.attr('aria-label', "#{status}: #{message}")
      @inputWraper.addClass(@tooltipErrorClasses)

    switch status
      when "Fetching"
        @statusIndicator.removeClass("error #{@tooltipErrorClasses}").addClass(statusClass)
      when "Error"
        @statusIndicator.removeClass('fetching').addClass(statusClass)
        displayTooltip status, message
      else
        @statusIndicator.removeClass('fetching error')
        @inputWraper.removeClass(@tooltipErrorClasses)

  # Fetches information about a repository from the Github API
  fetchInfoFromGithubAPI: (repositoryFullName, callback) ->
    $.getJSON "https://api.github.com/repos/"+repositoryFullName, (info) ->
      callback null, info
    .fail (e) ->
      if e.status == 404
        callback new Error "Repository <b>#{repositoryFullName}</b> not found."
      else
        callback new Error "Network error when trying to get information about <b>#{repositoryFullName}</b>."

  # Generates a message showing that a repository is already licensed
  repositoryLicense: (repositoryFullName, license) ->
    foundLicense = window.licenses.find (lic) -> lic.spdx_id == license.spdx_id
    if foundLicense # Links the license to its page on this site
      "The repository #{repositoryFullName} is already licensed under the #{foundLicense.title}."
    else
      "The repository #{repositoryFullName} is already licensed."

$ ->
  new Choosealicense()
