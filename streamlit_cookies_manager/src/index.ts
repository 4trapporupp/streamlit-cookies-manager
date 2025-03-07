import { RenderData, Streamlit } from "streamlit-component-lib"

const targetWindow: Window = window.parent || window
const targetDocument = targetWindow.document

let lastValue: string | null = null

interface AddCookieSpec {
    value: string
    expires_at: string
    path: string
    sameSite?: 'strict' | 'lax' | 'none'
    secure?: boolean
    domain?: string
}

interface DeleteCookieSpec {
    value: null
    path: string
    domain?: string
}

type CookieSpec = AddCookieSpec | DeleteCookieSpec

function onRender(event: Event): void {
    const data = (event as CustomEvent<RenderData>).detail

    const results = saveCookies(data.args["queue"])
    
    // Check if any cookies failed to set (especially in Safari)
    const failedCookies = Object.keys(results).filter(name => !results[name])
    if (failedCookies.length > 0) {
        console.warn("Failed to set cookies:", failedCookies)
    }

    // Read all cookies, including localStorage fallbacks
    const newValue = getAllCookiesString()
    if (lastValue !== newValue && !data.args.saveOnly) {
        Streamlit.setComponentValue(newValue)
        lastValue = newValue
    }
}

Streamlit.events.addEventListener(Streamlit.RENDER_EVENT, onRender)
Streamlit.setComponentReady()
Streamlit.setFrameHeight(0)

/**
 * Get all cookies as a string, including localStorage fallbacks
 */
function getAllCookiesString(): string {
    let cookieStr = targetDocument.cookie
    
    // If in Safari, also check localStorage fallbacks
    if (isSafari()) {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i)
                if (key && key.startsWith('cookie_fallback_')) {
                    const name = key.replace('cookie_fallback_', '')
                    const fallbackStr = localStorage.getItem(key)
                    if (fallbackStr) {
                        const fallback = JSON.parse(fallbackStr)
                        // Only include non-expired cookies
                        if (new Date(fallback.expires_at).getTime() > Date.now()) {
                            const cookiePart = `${name}=${fallback.value}`
                            // Add to cookie string if not already there
                            if (!cookieStr.includes(cookiePart)) {
                                cookieStr += (cookieStr ? '; ' : '') + cookiePart
                            }
                        } else {
                            // Clean up expired localStorage item
                            localStorage.removeItem(key)
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Error reading from localStorage", e)
        }
    }
    
    return cookieStr
}

/**
 * Detect if browser is Safari
 */
function isSafari(): boolean {
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}

/**
 * Saves cookies and returns an object with results of each cookie operation
 * @param queue Object containing cookies to set
 * @returns Object with cookie names as keys and boolean success status as values
 */
function saveCookies(queue: { [k in string]: CookieSpec }): { [k in string]: boolean } {
    const results: { [k in string]: boolean } = {}
    
    Object.keys(queue).forEach((name) => {
        const spec = queue[name]
        if (spec.value === null) {
            // For deleting cookies, ensure we have the same attributes as when setting
            targetDocument.cookie = `${encodeURIComponent(name)}=; max-age=0; path=${encodeURIComponent(spec.path)}${spec.domain ? `; domain=${spec.domain}` : ''}`
            
            // Also clean up any localStorage fallback
            if (isSafari()) {
                try {
                    localStorage.removeItem(`cookie_fallback_${name}`)
                } catch (e) {}
            }
            
            results[name] = !getCookie(name)
        } else {
            const date = new Date(spec.expires_at)
            
            // Safari may ignore far-future expirations, so ensure it's within reasonable limits
            // Adding max-age as an alternative to expires
            const maxAgeSecs = Math.floor((date.getTime() - Date.now()) / 1000)
            
            // Build the cookie string with all necessary attributes
            let cookieStr = `${encodeURIComponent(name)}=${encodeURIComponent(spec.value)}`
            cookieStr += `; expires=${date.toUTCString()}`
            cookieStr += `; max-age=${maxAgeSecs}`
            cookieStr += `; path=${encodeURIComponent(spec.path)}`
            
            // Add domain if specified
            if (spec.domain) {
                cookieStr += `; domain=${spec.domain}`
            }
            
            // Add SameSite attribute (Lax is the recommended default)
            cookieStr += `; SameSite=${spec.sameSite || 'Lax'}`
            
            // Add Secure flag when needed (required for SameSite=None)
            if (spec.secure || spec.sameSite === 'none') {
                cookieStr += '; Secure'
            }
            
            // Try to set the cookie
            targetDocument.cookie = cookieStr
            
            // Verify if the cookie was successfully set
            results[name] = cookieExists(name)
            
            // Safari fallback: If cookie failed, try localStorage
            if (!results[name] && isSafari()) {
                try {
                    localStorage.setItem(`cookie_fallback_${name}`, JSON.stringify({
                        value: spec.value,
                        expires_at: spec.expires_at,
                        path: spec.path
                    }))
                    results[name] = true
                } catch (e) {
                    console.error("Failed to use localStorage fallback", e)
                }
            }
        }
    })
    
    return results
}

/**
 * Checks if a cookie exists
 * @param name Cookie name
 * @returns boolean indicating if the cookie exists
 */
function cookieExists(name: string): boolean {
    return getCookie(name) !== null
}

/**
 * Gets a cookie value by name, with Safari localStorage fallback
 * @param name Cookie name
 * @returns Cookie value or null if not found
 */
function getCookie(name: string): string | null {
    // First try to get from regular cookies
    const cookies = targetDocument.cookie.split(';')
    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim()
        if (cookie.substring(0, name.length + 1) === (name + '=')) {
            return decodeURIComponent(cookie.substring(name.length + 1))
        }
    }
    
    // If not found and in Safari, try localStorage fallback
    if (isSafari()) {
        try {
            const fallbackStr = localStorage.getItem(`cookie_fallback_${name}`)
            if (fallbackStr) {
                const fallback = JSON.parse(fallbackStr)
                // Check if expired
                if (new Date(fallback.expires_at).getTime() > Date.now()) {
                    return fallback.value
                } else {
                    // Clean up expired localStorage item
                    localStorage.removeItem(`cookie_fallback_${name}`)
                }
            }
        } catch (e) {
            console.error("Error reading from localStorage", e)
        }
    }
    
    return null
}