export const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d\s])[^\s]{8,}$/

const PASSWORD_TOO_SHORT_MESSAGE = 'A senha deve ter pelo menos 8 caracteres.'
const PASSWORD_HAS_SPACES_MESSAGE = 'A senha nao pode conter espacos.'
const PASSWORD_MISSING_LOWERCASE_MESSAGE = 'A senha deve incluir pelo menos uma letra minuscula.'
const PASSWORD_MISSING_UPPERCASE_MESSAGE = 'A senha deve incluir pelo menos uma letra maiuscula.'
const PASSWORD_MISSING_NUMBER_MESSAGE = 'A senha deve incluir pelo menos um numero.'
const PASSWORD_MISSING_SPECIAL_MESSAGE = 'A senha deve incluir pelo menos um caractere especial.'
let lastRegistrationInput = null
let lastRegistrationOutput = ''
let lastFormattedRegistrationInput = null
let lastFormattedRegistrationOutput = ''
let lastEmailInput = null
let lastEmailOutput = ''
let lastValidEmailInput = null
let lastValidEmailOutput = false
let lastPasswordInput = null
let lastPasswordOutput = ''
let lastValidationAuthMode = null
let lastValidationForm = null
let lastValidationName = null
let lastValidationRegistration = null
let lastValidationEmail = null
let lastValidationPassword = null
let lastValidationOutput = ''

function isDigitCode(code) {
  return code >= 48 && code <= 57
}

function isLowercaseCode(code) {
  return code >= 97 && code <= 122
}

function isUppercaseCode(code) {
  return code >= 65 && code <= 90
}

function isAlphaCode(code) {
  return isLowercaseCode(code) || isUppercaseCode(code)
}

function isAlphaNumericCode(code) {
  return isAlphaCode(code) || isDigitCode(code)
}

function isWhitespaceCode(code) {
  return code === 32 || code === 9 || code === 10 || code === 13 || code === 12 || code === 11
}

export function normalizeRegistration(value) {
  const input = String(value || '')

  if (input === lastRegistrationInput) {
    return lastRegistrationOutput
  }

  let digits = ''

  for (let index = 0; index < input.length && digits.length < 10; index += 1) {
    const charCode = input.charCodeAt(index)

    if (isDigitCode(charCode)) {
      digits += input[index]
    }
  }

  lastRegistrationInput = input
  lastRegistrationOutput = digits
  return digits
}

export function formatRegistration(value) {
  const input = String(value || '')

  if (input === lastFormattedRegistrationInput) {
    return lastFormattedRegistrationOutput
  }

  const digits = normalizeRegistration(value)
  const formatted = digits.length <= 4 ? digits : `${digits.slice(0, 4)} ${digits.slice(4)}`

  lastFormattedRegistrationInput = input
  lastFormattedRegistrationOutput = formatted
  return formatted
}

export function normalizeEmail(email) {
  const input = String(email || '')

  if (input === lastEmailInput) {
    return lastEmailOutput
  }

  const normalized = input.trim().toLowerCase()
  lastEmailInput = input
  lastEmailOutput = normalized
  return normalized
}

export function isValidEmail(email) {
  if (email === lastValidEmailInput) {
    return lastValidEmailOutput
  }

  const normalizedEmail = normalizeEmail(email)
  const atIndex = normalizedEmail.indexOf('@')

  if (
    atIndex <= 0 ||
    atIndex !== normalizedEmail.lastIndexOf('@') ||
    atIndex === normalizedEmail.length - 1
  ) {
    lastValidEmailInput = email
    lastValidEmailOutput = false
    return false
  }

  const localPart = normalizedEmail.slice(0, atIndex)
  const domainPart = normalizedEmail.slice(atIndex + 1)
  const lastDotIndex = domainPart.lastIndexOf('.')

  if (lastDotIndex <= 0 || lastDotIndex === domainPart.length - 1) {
    lastValidEmailInput = email
    lastValidEmailOutput = false
    return false
  }

  for (let index = 0; index < localPart.length; index += 1) {
    const charCode = localPart.charCodeAt(index)

    if (
      !isAlphaNumericCode(charCode) &&
      charCode !== 46 &&
      charCode !== 95 &&
      charCode !== 37 &&
      charCode !== 43 &&
      charCode !== 45
    ) {
      lastValidEmailInput = email
      lastValidEmailOutput = false
      return false
    }
  }

  for (let index = 0; index < domainPart.length; index += 1) {
    const charCode = domainPart.charCodeAt(index)

    if (!isAlphaNumericCode(charCode) && charCode !== 46 && charCode !== 45) {
      lastValidEmailInput = email
      lastValidEmailOutput = false
      return false
    }
  }

  for (let index = lastDotIndex + 1; index < domainPart.length; index += 1) {
    if (!isAlphaCode(domainPart.charCodeAt(index))) {
      lastValidEmailInput = email
      lastValidEmailOutput = false
      return false
    }
  }

  lastValidEmailInput = email
  lastValidEmailOutput = domainPart.length - lastDotIndex - 1 >= 2
  return lastValidEmailOutput
}

export function getPasswordSecurityMessage(password) {
  const value = String(password || '')

  if (value === lastPasswordInput) {
    return lastPasswordOutput
  }

  let hasWhitespace = false
  let hasLowercase = false
  let hasUppercase = false
  let hasNumber = false
  let hasSpecial = false

  if (value.length < 8) {
    lastPasswordInput = value
    lastPasswordOutput = PASSWORD_TOO_SHORT_MESSAGE
    return lastPasswordOutput
  }

  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index)

    if (isWhitespaceCode(charCode)) {
      hasWhitespace = true
      continue
    }

    if (isLowercaseCode(charCode)) {
      hasLowercase = true
      continue
    }

    if (isUppercaseCode(charCode)) {
      hasUppercase = true
      continue
    }

    if (isDigitCode(charCode)) {
      hasNumber = true
      continue
    }

    hasSpecial = true
  }

  if (hasWhitespace) {
    lastPasswordInput = value
    lastPasswordOutput = PASSWORD_HAS_SPACES_MESSAGE
    return lastPasswordOutput
  }

  if (!hasLowercase) {
    lastPasswordInput = value
    lastPasswordOutput = PASSWORD_MISSING_LOWERCASE_MESSAGE
    return lastPasswordOutput
  }

  if (!hasUppercase) {
    lastPasswordInput = value
    lastPasswordOutput = PASSWORD_MISSING_UPPERCASE_MESSAGE
    return lastPasswordOutput
  }

  if (!hasNumber) {
    lastPasswordInput = value
    lastPasswordOutput = PASSWORD_MISSING_NUMBER_MESSAGE
    return lastPasswordOutput
  }

  if (!hasSpecial) {
    lastPasswordInput = value
    lastPasswordOutput = PASSWORD_MISSING_SPECIAL_MESSAGE
    return lastPasswordOutput
  }

  lastPasswordInput = value
  lastPasswordOutput = ''
  return lastPasswordOutput
}

export function validateAuthForm(authMode, form) {
  if (
    authMode === lastValidationAuthMode &&
    form === lastValidationForm &&
    form?.name === lastValidationName &&
    form?.registration === lastValidationRegistration &&
    form?.email === lastValidationEmail &&
    form?.password === lastValidationPassword
  ) {
    return lastValidationOutput
  }

  const registration = normalizeRegistration(form.registration)
  let result = ''

  if (authMode === 'register' && String(form.name || '').trim().length < 3) {
    result = 'Informe um nome valido.'
  } else if (registration.length !== 10) {
    result = 'A matricula deve ter 10 digitos.'
  } else if (authMode === 'register' && !isValidEmail(form.email)) {
    result = 'Informe um e-mail valido.'
  } else {
    result = getPasswordSecurityMessage(form.password)
  }

  lastValidationAuthMode = authMode
  lastValidationForm = form
  lastValidationName = form?.name
  lastValidationRegistration = form?.registration
  lastValidationEmail = form?.email
  lastValidationPassword = form?.password
  lastValidationOutput = result
  return result
}
