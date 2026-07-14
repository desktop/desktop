const TOOLTIP_CLASSES = ['hint--bottom', 'hint--large', 'hint--no-animate', 'override-hint-inline'];
const TOOLTIP_ATTRIBUTES_BY_RULE = {
  permissions: {
    heading: 'Permission',
    color: 'tooltip--permissions'
  },
  conditions: {
    heading: 'Condition',
    color: 'tooltip--conditions'
  },
  limitations: {
    heading: 'Limitation',
    color: 'tooltip--limitations'
  }
};

class Choosealicense {
  constructor() {
    this.initTooltips();
    this.initClipboard();
    this.initLicenseSuggestion();
  }

  // Selects the content of a given element
  selectText(element) {
    if (document.body.createTextRange) {
      const range = document.body.createTextRange();
      range.moveToElementText(element);
      range.select();
    } else if (window.getSelection) {
      const selection = window.getSelection();
      const range = document.createRange();

      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  // Init tooltip action
  initTooltips() {
    const annotations = window.annotations || {};
    // Localized, reorderable tooltip template (see _data/i18n/<lang>/ui.yml).
    // Falls back to the English word order if the page didn't provide them.
    const format = window.tooltipFormat || '%label% %category%: %description%';
    const categories = window.tooltipCategory || {};

    Object.entries(annotations).forEach(([ruletype, rules]) => {
      const tooltipAttr = TOOLTIP_ATTRIBUTES_BY_RULE[ruletype];
      if (!tooltipAttr) return;

      const category = categories[ruletype] || tooltipAttr.heading.toLowerCase();

      rules.forEach((rule) => {
        const elements = Array.from(
          document.querySelectorAll(`.license-${ruletype} .${rule.tag}`)
        ).filter((el) => !el.closest(`dd.license-${ruletype}`));

        // Function replacers avoid `$` being treated as a special pattern.
        const ariaLabel = format
          .replace('%category%', () => category)
          .replace('%label%', () => rule.label)
          .replace('%description%', () => rule.description);

        elements.forEach((el) => {
          el.setAttribute('aria-label', ariaLabel);
          el.classList.add(...TOOLTIP_CLASSES, tooltipAttr.color);
        });
      });
    });
  }

  // Initializes copy-to-clipboard behavior
  initClipboard() {
    const buttons = document.querySelectorAll('.js-clipboard-button');
    buttons.forEach((button) => {
      button.dataset.clipboardPrompt = button.textContent;
      button.addEventListener('click', (event) => {
        event.preventDefault();

        const targetSelector = button.getAttribute('data-clipboard-target');
        if (!targetSelector) return;

        const targetElement = document.querySelector(targetSelector);
        if (!targetElement) return;

        this.selectText(targetElement);

        const textToCopy = targetElement.textContent || '';
        if (!textToCopy) return;

        this.copyText(textToCopy)
          .then(() => {
            button.textContent = button.dataset.copiedLabel || 'Copied!';
          })
          .catch(() => {
            // If copying fails, leave the prompt unchanged.
          });
      });

      const restorePrompt = () => {
        button.textContent = button.dataset.clipboardPrompt || '';
      };

      button.addEventListener('mouseleave', restorePrompt);
      button.addEventListener('blur', restorePrompt);
    });
  }

  copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }

    return new Promise((resolve, reject) => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);

      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);

      try {
        const successful = document.execCommand('copy');
        if (!successful) {
          throw new Error('Copy command was unsuccessful');
        }
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        document.body.removeChild(textarea);
      }
    });
  }

  // Initializes the repository suggestion feature
  initLicenseSuggestion() {
    const inputEl = document.querySelector('#repository-url');
    const statusIndicator = document.querySelector('.status-indicator');
    if (!inputEl || !statusIndicator) return;

    const licenseId = inputEl.getAttribute('data-license-id');
    new LicenseSuggestion(inputEl, licenseId, statusIndicator);
  }
}

class LicenseSuggestion {
  constructor(inputEl, licenseId, statusIndicator) {
    this.inputEl = inputEl;
    this.licenseId = licenseId;
    this.statusIndicator = statusIndicator;
    this.inputWrapper = document.querySelector('.input-wrapper');
    this.tooltipErrorClasses = ['hint--bottom', 'tooltip--error', 'hint--always'];

    this.bindEventHandlers();
  }

  // Main event handlers for user input
  bindEventHandlers() {
    this.inputEl.addEventListener('input', () => {
      this.setStatus('');
    });

    this.inputEl.addEventListener('keyup', (event) => {
      if (event.key !== 'Enter' || !event.target.value) return;

      let repositoryFullName;
      try {
        repositoryFullName = this.parseUserInput(event.target.value);
      } catch (error) {
        this.setStatus('Error', 'Invalid URL.');
        return;
      }

      this.setStatus('Fetching');
      this.fetchInfoFromGithubAPI(repositoryFullName, (err, repositoryInfo = null) => {
        if (err) {
          this.setStatus('Error', err.message);
          return;
        }
        if (repositoryInfo.license) {
          const license = repositoryInfo.license;
          this.setStatus('Error', this.repositoryLicense(repositoryFullName, license));
        } else {
          const licenseUrl = encodeURIComponent(
            `https://github.com/${repositoryFullName}/community/license/new?template=${this.licenseId}`
          );
          window.location.href = `https://github.com/login?return_to=${licenseUrl}`;
          this.setStatus('');
          this.inputEl.value = '';
        }
      });
    });
  }

  // Try to extract the repository full name from the user input
  parseUserInput(userInput) {
    const repository = /https?:\/\/github\.com\/([^\/]+)\/([^\/?#]+)/.exec(userInput);
    if (!repository) throw new Error('Invalid URL.');

    const [, username, project] = repository;
    return `${username}/${project.replace(/(\.git)$/, '')}`;
  }

  // Displays an indicator and tooltips to the user about the current status
  setStatus(status = '', message = '') {
    const statusClass = status.toLowerCase();
    const displayTooltip = (s, m) => {
      if (!this.inputWrapper) return;
      this.inputWrapper.setAttribute('aria-label', `${s}: ${m}`);
      this.inputWrapper.classList.add(...this.tooltipErrorClasses);
    };

    switch (status) {
      case 'Fetching':
        this.statusIndicator.classList.remove('error', ...this.tooltipErrorClasses);
        this.statusIndicator.classList.add(statusClass);
        break;
      case 'Error':
        this.statusIndicator.classList.remove('fetching');
        this.statusIndicator.classList.add(statusClass);
        displayTooltip(status, message);
        break;
      default:
        this.statusIndicator.classList.remove('fetching', 'error');
        if (this.inputWrapper) {
          this.inputWrapper.classList.remove(...this.tooltipErrorClasses);
        }
        break;
    }
  }

  // Fetches information about a repository from the Github API
  fetchInfoFromGithubAPI(repositoryFullName, callback) {
    fetch(`https://api.github.com/repos/${repositoryFullName}`)
      .then((response) => {
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(`Repository ${repositoryFullName} not found.`);
          }
          throw new Error(`Network error when trying to get information about ${repositoryFullName}.`);
        }
        return response.json();
      })
      .then((info) => callback(null, info))
      .catch((error) => callback(error));
  }

  // Generates a message showing that a repository is already licensed
  repositoryLicense(repositoryFullName, license) {
    const foundLicense = window.licenses.find((lic) => lic.spdx_id === license.spdx_id);
    if (foundLicense) {
      return `The repository ${repositoryFullName} is already licensed under the ${foundLicense.title}.`;
    }
    return `The repository ${repositoryFullName} is already licensed.`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new Choosealicense();
});
