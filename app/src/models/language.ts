

export class Language {
  private lang: string = "en_US";

  public constructor(languageToUse: string) {
    this.lang = languageToUse
    this.loadLanguage();
  }

  /** Load the selected language from it's JSON file */
  private loadLanguage() {

  }
}
