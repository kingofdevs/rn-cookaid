import ConfigApp from "./ConfigApp";
import {getStore} from "../redux/index";
import {AsyncStorage} from 'react-native';
import axios from "axios";
import * as Localization from 'expo-localization';
import {getArrayStringFromXML} from "./utils";

//////////////////// STRINGS

export function translate(string, targetLanguage) {
  return new Promise((resolve, reject) => {
    axios.post(`https://translation.googleapis.com/language/translate/v2?key=${ConfigApp.GOOGLE_TRANSLATE_API_KEY}`,
      {
        "q": string,
        "source": "en",
        "target": targetLanguage,
        "format": "text"
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      })
      .then(res => {
        if (res.data && res.data.data && res.data.data.translations && res.data.data.translations[0]) {
          return resolve(res.data.data.translations[0].translatedText)
        }
        return reject({message: 'invalid response', data: res.data})
      })
      .catch(err => {
        return reject(err)
      })
  })
}

export function translatePromt(string, targetLanguage) {
  return new Promise((resolve, reject) => {
    axios.get(`https://pts.promt.com/pts/Services/v1/rest.svc/TranslateText`,
      {
        params: {
          text: string,
          from: "en",
          to: targetLanguage,
          profile: "universal",
          apiKey: ConfigApp.PROMT_TRANSLATE_API_KEY,
        },
        headers: {
          "Content-Type": "application/json"
        }
      })
      .then(res => {
        if (res.data) {
          return resolve(res.data)
        }
        return reject({message: 'invalid response', data: res.data})
      })
      .catch(err => {
        return reject(err)
      })
  })
}

export function translatePromptStringArray(stringArray, targetLanguage) {
  return new Promise((resolve, reject) => {
    if (targetLanguage.startsWith("en") || targetLanguage === 'en') {
      return resolve(stringArray);
    }
    axios.post(`https://pts.promt.com/pts/Services/v1/rest.svc/TranslateFormattedArray`,
      {
        texts: stringArray,
        from: "en",
        to: targetLanguage,
        profile: "universal",
        format: "text/html",
      },
      {
        params: {
          apiKey: ConfigApp.PROMT_TRANSLATE_API_KEY,
        },
        headers: {
          "Content-Type": "application/json"
        }
      })
      .then(res => {
        if (res.data && Array.isArray(res.data)) {
          return resolve(res.data);
        } else if (res.data && res.data.constant("<string>")) {
          const result = getArrayStringFromXML(res.data);
          return resolve(result);
        }
        return reject({message: 'invalid response', data: res.data})
      })
      .catch(err => {
        return reject(err)
      })
  })
}

export function translateObject(sourceObject) {

  const targetLanguage = getTargetLanguage();
  return new Promise((resolve, reject) => {
    if (targetLanguage.startsWith("en") || targetLanguage === 'en') {
      return resolve(sourceObject);
    }
    const result = {};
    const resultPromises = [];
    const keys = Object.keys(sourceObject);
    keys.map(keyItem => {
      const value = sourceObject[keyItem];
      if (!isNaN(value)) {
        result[keyItem] = value;
        return;
      }
      if (typeof value != 'string') {
        result[keyItem] = value;
        return;
      }
      const promise = translatePromt(value, targetLanguage)
        .then(translated => {
          result[keyItem] = translated;
        });
      resultPromises.push(promise);
    });
    Promise.all(resultPromises)
      .then(() => {
        return resolve(result);
      })
      .catch(err => {
        return reject(err);
      })
  })
}

export function translateByProperty(sourceObject, key, targetLanguage) {

  return new Promise((resolve, reject) => {
    const value = sourceObject[key];
    if (!value || !isNaN(value)) {
      return resolve(sourceObject);
    }
    const promise = translatePromt(value, targetLanguage)
      .then(translated => {
        sourceObject[key] = translated;
        return resolve(sourceObject)
      })
      .catch(err => {
        return reject(err)
      })
  })
}

export function translating(sourceObject, key = null) {
  const targetLanguage = getTargetLanguage();
  if (!Array.isArray(sourceObject)) {
    return translateObject(sourceObject, targetLanguage);
  }
  return new Promise((resolve, reject) => {
    if (targetLanguage.startsWith("en") || targetLanguage === 'en') {
      return resolve(sourceObject);
    }
    const promises = [];
    sourceObject.map(item => {
      item[key + "_original"] = item[key];
      const promise = translateByProperty(item, key, targetLanguage);
      promises.push(promise);
    });
    Promise.all(promises)
      .then(results => {
        return resolve(results);
      })
      .catch(err => {
        return reject(err)
      })
  })
}

export function translateRecipe(recipe) {
  const targetLanguage = getTargetLanguage();
  return new Promise((resolve, reject) => {
    if (targetLanguage.startsWith("en") || targetLanguage === 'en') {
      recipe.language = targetLanguage;
      return resolve(recipe);
    }
    const result = Object.assign({}, recipe);
    const resultPromises = [];
    const keys = [
      // "chef_title",
      // "category_title",
      "recipe_title",
      "extendedIngredients",
      "analyzedInstructions",
      // "extendedIngredients",
    ];
    keys.map(keyItem => {
      const value = recipe[keyItem];
      if (!isNaN(value)) {
        result[keyItem] = value;
        return;
      }
      if (!value) {
        return;
      }
      if (keyItem === "recipe_title" && (recipe["recipe_title_translated"] === targetLanguage || recipe['language'] === targetLanguage)) {
        return;
      }
      if (keyItem === "extendedIngredients" && recipe[keyItem]) {
        const promise = new Promise(async (resolve1, reject1) => {
          try {
            const extendedIngredientNames = recipe[keyItem].map(item => item.name);
            const translatedNames = await translatePromptStringArray(extendedIngredientNames, targetLanguage);
            const extendedIngredients = recipe[keyItem].map((item, index) => {
              item.name = translatedNames[index];
              return item;
            });
            result[keyItem] = extendedIngredients;
            return resolve1()
          } catch (e) {
            return reject1(e)
          }
        });
        resultPromises.push(promise);
        return;
      }
      if (keyItem === "analyzedInstructions"
        && recipe['analyzedInstructions']
        && recipe['analyzedInstructions'][0]
        && recipe['analyzedInstructions'][0].steps) {
        const promise = new Promise(async (resolve1, reject1) => {
          try {
            const steps = recipe['analyzedInstructions'][0].steps;
            const stepsString = steps.map(item => item.step);
            const translatedStep = await translatePromptStringArray(stepsString, targetLanguage);
            const newSteps = steps.map((item, index) => {
              item.step = translatedStep[index];
            })
            result['analyzedInstructions'][0].step = newSteps;
            return resolve1()
          } catch (e) {
            return reject1(e);
          }
        })
        resultPromises.push(promise)
        return;
      }
      if (typeof value != 'string') {
        result[keyItem] = value;
        return;
      }
      const promise = translatePromt(value, targetLanguage)
        .then(translated => {
          result[keyItem] = translated;
        })
        .catch(err => {
          console.log('err', err)
        });
      resultPromises.push(promise);
    });
    Promise.all(resultPromises)
      .then(() => {
        result["language"] = targetLanguage;
        return resolve(result);
      })
      .catch(err => {
        console.log('err', err)
        return reject(err);
      })
  })
}

export function getTargetLanguage() {
  /*const locate = Localization.locale;

  if (locate.startsWith("zh-Hans-")) {
    return "zh-CN";
  }

  const splitted = locate.split("-");
  if (splitted.length === 2) {
    return splitted[0];
  }
  return locate;*/
  // const redux

  if (selectedLanguageCode) {
    return selectedLanguageCode;
  }
  // if (store) {
  //   const state = store.getState();
  //   const selectedLanguage = state.homeRecipes.selectedLanguage;
  //   if (selectedLanguage && selectedLanguage.code) {
  //     return selectedLanguage.code;
  //   }
  // }
  return "en";
}

function getDefaultPhoneLanguage() {
  const locate = Localization.locale;

  if (locate.startsWith("zh-Hans")) {
    return "zh-CN";
  }

  if (locate === "zh-CN" || locate === "zh-TW") {
    return locate;
  }

  const splitted = locate.split("-");
  if (splitted.length === 2) {
    return splitted[0];
  }
  return "en";
}

let selectedLanguageCode;

export async function getSelectedLanguage() {
  try {
    const json = await AsyncStorage.getItem("selected_language");
    const selectedLanguage = JSON.parse(json);
    selectedLanguageCode = selectedLanguage ? selectedLanguage.code : getDefaultPhoneLanguage();
  } catch (e) {
    selectedLanguageCode = getDefaultPhoneLanguage();
  }
}



getSelectedLanguage();

/*
export function getListLanguages() {
  return [
    {name: "Afrikaans", code: "af"},
    {name: "Albanian", code: "sq"},
    {name: "Amharic", code: "am"},
    {name: "Arabic", code: "ar"},
    {name: "Armenian", code: "hy"},
    {name: "Azerbaijani", code: "az"},
    {name: "Basque", code: "eu"},
    {name: "Belarusian", code: "be"},
    {name: "Bengali", code: "bn"},
    {name: "Bosnian", code: "bs"},
    {name: "Bulgarian", code: "bg"},
    {name: "Catalan", code: "ca"},
    {name: "Cebuano", code: "ceb"},
    {name: "Chinese (Simplified)", code: 'zh-CN'},
    {name: "Chinese (Traditional)", code: "zh-TW"},
    {name: "Corsican", code: "co"},
    {name: "Croatian", code: "hr"},
    {name: "Czech", code: "cs"},
    {name: "Danish", code: "da"},
    {name: "Dutch", code: "nl"},
    {name: "English", code: "en"},
    {name: "Esperanto", code: "eo"},
    {name: "Estonian", code: "et"},
    {name: "Finnish", code: "fi"},
    {name: "French", code: "fr"},
    {name: "Frisian", code: "fy"},
    {name: "Galician", code: "gl"},
    {name: "Georgian", code: "ka"},
    {name: "German", code: "de"},
    {name: "Greek", code: "el"},
    {name: "Gujarati", code: "gu"},
    {name: "Haitian Creole", code: "ht"},
    {name: "Hausa", code: "ha"},
    {name: "Hawaiian", code: "haw"},
    {name: "Hebrew", code: "he"},
    {name: "Hindi", code: "hi"},
    {name: "Hmong", code: "hmn"},
    {name: "Hungarian", code: "hu"},
    {name: "Icelandic", code: "is"},
    {name: "Igbo", code: "ig"},
    {name: "Indonesian", code: "id"},
    {name: "Irish", code: "ga"},
    {name: "Italian", code: "it"},
    {name: "Japanese", code: "ja"},
    {name: "Javanese", code: "jw"},
    {name: "Kannada", code: "kn"},
    {name: "Kazakh", code: "kk"},
    {name: "Khmer", code: "km"},
    {name: "Korean", code: "ko"},
    {name: "Kurdish", code: "ku"},
    {name: "Kyrgyz", code: "ky"},
    {name: "Lao", code: "lo"},
    {name: "Latin", code: "la"},
    {name: "Latvian", code: "lv"},
    {name: "Lithuanian", code: "lt"},
    {name: "Luxembourgish", code: "lb"},
    {name: "Macedonian", code: "mk"},
    {name: "Malagasy", code: "mg"},
    {name: "Malay", code: "ms"},
    {name: "Malayalam", code: "ml"},
    {name: "Maltese", code: "mt"},
    {name: "Maori", code: "mi"},
    {name: "Marathi", code: "mr"},
    {name: "Mongolian", code: "mn"},
    {name: "Myanmar (Burmese)", code: "my"},
    {name: "Nepali", code: "ne"},
    {name: "Norwegian", code: "no"},
    {name: "Nyanja (Chichewa)", code: "ny"},
    {name: "Pashto", code: "ps"},
    {name: "Persian", code: "fa"},
    {name: "Polish", code: "pl"},
    {name: "Portuguese (Portugal, Brazil)", code: "pt"},
    {name: "Punjabi", code: "pa"},
    {name: "Romanian", code: "ro"},
    {name: "Russian", code: "ru"},
    {name: "Samoan", code: "sm"},
    {name: "Scots Gaelic", code: "gd"},
    {name: "Serbian", code: "sr"},
    {name: "Sesotho", code: "st"},
    {name: "Shona", code: "sn"},
    {name: "Sindhi", code: "sd"},
    {name: "Sinhala (Sinhalese)", code: "si"},
    {name: "Slovak", code: "sk"},
    {name: "Slovenian", code: "sl"},
    {name: "Somali", code: "so"},
    {name: "Spanish", code: "es"},
    {name: "Sundanese", code: "su"},
    {name: "Swahili", code: "sw"},
    {name: "Swedish", code: "sv"},
    {name: "Tagalog (Filipino)", code: "tl"},
    {name: "Tajik", code: "tg"},
    {name: "Tamil", code: "ta"},
    {name: "Telugu", code: "te"},
    {name: "Thai", code: "th"},
    {name: "Turkish", code: "tr"},
    {name: "Ukrainian", code: "uk"},
    {name: "Urdu", code: "ur"},
    {name: "Uzbek", code: "uz"},
    {name: "Vietnamese", code: "vi"},
    {name: "Welsh", code: "cy"},
    {name: "Xhosa", code: "xh"},
    {name: "Yiddish", code: "yi"},
    {name: "Yoruba", code: "yo"},
    {name: "Zulu", code: "zu"}
  ]
}
*/

// List language support by Promt API
export function getListLanguages() {
  return [
    {name: "Arabic", code: "ar"},
    {name: "Bulgarian", code: "bg"},
    {name: "Chinese (Simplified)", code: 'zh-CN'},
    {name: "Chinese (Traditional)", code: "zh-TW"},
    {name: "Dutch", code: "nl"},
    {name: "English", code: "en"},
    {name: "Finnish", code: "fi"},
    {name: "French", code: "fr"},
    {name: "German", code: "de"},
    {name: "Hebrew", code: "he"},
    {name: "Hungarian", code: "hu"},
    {name: "Hindi", code: "hi"},
    {name: "Italian", code: "it"},
    {name: "Japanese", code: "ja"},
    {name: "Kazakh", code: "kk"},
    {name: "Korean", code: "ko"},
    {name: "Latvian", code: "lv"},
    {name: "Persian (Farsi)", code: "fa"},
    {name: "Polish", code: "pl"},
    {name: "Portuguese", code: "pt"},
    {name: "Russian", code: "ru"},
    {name: "Spanish", code: "es"},
    {name: "Turkish", code: "tr"},
    {name: "Ukrainian", code: "uk"},
    {name: "Uzbek", code: "uz"},
  ]
}
