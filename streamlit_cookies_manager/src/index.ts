import {RenderData, Streamlit} from "streamlit-component-lib"

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

    saveCookies(data.args["queue"])

    const newValue = targetDocument.cookie
    if (lastValue !== newValue && !data.args.saveOnly) {
        Streamlit.setComponentValue(newValue)
        lastValue = newValue
    }
}

Streamlit.events.addEventListener(Streamlit.RENDER_EVENT, onRender)
Streamlit.setComponentReady()
Streamlit.setFrameHeight(0)

function saveCookies(queue: { [k in string]: CookieSpec }) {
    Object.keys(queue).forEach((name) => {
        const spec = queue[name];
        if (spec.value === null) {
            // For deleting cookies, ensure we have the same attributes as when setting
            targetDocument.cookie = `${encodeURIComponent(name)}=; max-age=0; path=${encodeURIComponent(spec.path)}${spec.domain ? `; domain=${spec.domain}` : ''}`;
        } else {
            const date = new Date(spec.expires_at);
            
            // Build the cookie string with all necessary attributes
            let cookieStr = `${encodeURIComponent(name)}=${encodeURIComponent(spec.value)};`;
            cookieStr += ` expires=${date.toUTCString()};`;
            cookieStr += ` path=${encodeURIComponent(spec.path)};`;
            
            // Add domain if specified (important for cross-subdomain functionality)
            if (spec.domain) {
                cookieStr += ` domain=${spec.domain};`;
            }
            
            // Add SameSite attribute (default to Lax if not specified)
            cookieStr += ` SameSite=${spec.sameSite || 'Lax'};`;
            
            // Add Secure flag when needed
            // Required for 'SameSite=None' and recommended for production
            if (spec.secure || spec.sameSite === 'none') {
                cookieStr += ' Secure;';
            }
            
            targetDocument.cookie = cookieStr;
        }
    })
}