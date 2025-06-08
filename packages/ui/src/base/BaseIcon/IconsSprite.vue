<script setup lang="ts">
export type IconName =
  | "logo"
  | "calendar"
  | "moon"
  | "sun"
  | "x-mark"
  | "chevron-left"
  | "chevron-right"
  | "chevron-up"
  | "plus"
  | "pencil"
  | "markdown"
  | "background"
  | "check"
  | "check-check"
  | "undo"
  | "hand-raised"
  | "touch-hold"
  | "empty"
  | "sparkles"
  | "drag-handle-vertical"
  | "keyboard"
  | "fire"
  | "star"
  | "info"
  | "today"
  | "cog"
  | "cog-off"
  | "install"
  | "sidebar"
  | "folder"
  | "export"
</script>

<template>
  <svg class="hidden" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <symbol id="logo" viewBox="0 0 300 300" fill="none">
      <path
        d="M240.001 0C273.138 0 300.001 26.8629 300.001 60V240.001C300.001 273.138 273.138 300.001 240.001 300.001H60C26.8629 300.001 0 273.138 0 240.001V60C2.96392e-05 26.8629 26.8629 0 60 0H240.001ZM76.0566 64.7891V95.9717H89.7764V205.616H76.0566V236.685H142.048C149.908 236.684 157.449 235.664 164.668 233.623C171.887 231.582 178.615 228.691 184.851 224.949C191.086 221.207 196.755 216.709 201.857 211.456C206.96 206.203 211.325 200.382 214.953 193.995C218.581 187.608 221.378 180.747 223.344 173.415C225.309 166.083 226.292 158.448 226.292 150.511C226.292 142.574 225.309 134.938 223.344 127.605C221.379 120.273 218.582 113.433 214.953 107.083C211.325 100.733 206.959 94.9692 201.857 89.791C196.756 84.6129 191.087 80.1717 184.851 76.4678C178.614 72.7639 171.887 69.8915 164.668 67.8506C157.449 65.8096 149.908 64.7891 142.047 64.7891H76.0566ZM141.82 95.9766C147.943 95.9763 153.725 97.3748 159.168 100.172C164.61 102.969 169.335 106.824 173.341 111.737C177.347 116.65 180.522 122.432 182.865 129.084C185.209 135.736 186.38 142.88 186.38 150.515C186.38 158.225 185.209 165.425 182.865 172.115C180.522 178.805 177.347 184.625 173.341 189.576C169.335 194.527 164.61 198.439 159.168 201.312C153.725 204.184 147.942 205.62 141.819 205.62H127.42V95.9756L141.82 95.9766Z"
        fill="currentColor"
      />
    </symbol>

    <symbol id="moon" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"
      />
    </symbol>

    <symbol id="sun" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
      />
    </symbol>

    <svg id="calendar" viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 2v4"></path>
        <path d="M16 2v4"></path>
        <rect width="18" height="18" x="3" y="4" rx="2"></rect>
        <path d="M3 10h18"></path>
        <path d="M8 14h.01"></path>
        <path d="M12 14h.01"></path>
        <path d="M16 14h.01"></path>
        <path d="M8 18h.01"></path>
        <path d="M12 18h.01"></path>
        <path d="M16 18h.01"></path>
      </g>
    </svg>

    <symbol id="calendar-x" viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 2v4"></path>
        <path d="M16 2v4"></path>
        <rect width="18" height="18" x="3" y="4" rx="2"></rect>
        <path d="M3 10h18"></path>
        <path d="m14 14-4 4"></path>
        <path d="m10 14 4 4"></path>
      </g>
    </symbol>

    <symbol id="x-mark" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
    </symbol>

    <symbol id="chevron-left" fill="none" viewBox="0 0 24 24">
      <path stroke-width="1.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </symbol>

    <symbol id="chevron-right" fill="none" viewBox="0 0 24 24">
      <path stroke-width="1.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </symbol>

    <symbol id="chevron-up" fill="none" viewBox="0 0 24 24">
      <path stroke-width="1.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M19.5 12l-7.5 7.5-7.5-7.5" />
    </symbol>

    <symbol id="plus" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </symbol>

    <symbol id="pencil" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125"
      />
    </symbol>

    <symbol id="check" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
      <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </symbol>

    <symbol id="check-check" viewBox="0 0 24 24" fill="none">
      <g stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 6 7 17l-5-5"></path>
        <path d="m22 10-7.5 7.5L13 16"></path>
      </g>
    </symbol>

    <symbol id="undo" fill="none" viewBox="0 0 24 24">
      <path stroke-width="2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </symbol>

    <symbol id="markdown" viewBox="0 0 128 128">
      <path
        d="M11.95 24.348c-5.836 0-10.618 4.867-10.618 10.681v57.942c0 5.814 4.782 10.681 10.617 10.681h104.102c5.835 0 10.617-4.867 10.617-10.681V35.03c0-5.814-4.783-10.681-10.617-10.681H14.898l-.002-.002zm-.007 9.543h104.108c.625 0 1.076.423 1.076 1.14v57.94c0 .717-.453 1.14-1.076 1.14H11.949c-.623 0-1.076-.423-1.076-1.14V35.029c0-.715.451-1.135 1.07-1.138"
        color="currentColor"
      />
      <path
        d="M20.721 84.1V43.9H32.42l11.697 14.78L55.81 43.9h11.696v40.2H55.81V61.044l-11.694 14.78l-11.698-14.78V84.1H20.722zm73.104 0L76.28 64.591h11.697V43.9h11.698v20.69h11.698zm0 0"
      />
    </symbol>

    <symbol id="background" viewBox="0 0 24 24">
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="m4 8l4-4m6 0L4 14m0 6L20 4m0 6L10 20m10-4l-4 4"
      />
    </symbol>

    <symbol id="hand-raised" viewBox="0 0 24 24" fill="none">
      <g stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"></path>
        <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"></path>
        <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"></path>
        <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"></path>
      </g>
    </symbol>

    <symbol id="touch-hold" viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" color="currentColor">
        <path d="M6.5 21v-9.5a5.5 5.5 0 1 1 11 0V21" />
        <path d="M3 13v-1a9 9 0 0 1 18 0v1" />
        <path d="M14.5 11.5a2.5 2.5 0 0 0-5 0v1.25c0 .69.56 1.25 1.25 1.25h2.5c.69 0 1.25-.56 1.25-1.25z" />
      </g>
    </symbol>

    <symbol id="empty" viewBox="0 0 256 256">
      <path
        fill="currentColor"
        d="m198.24 62.63l15.68-17.25a8 8 0 0 0-11.84-10.76L186.4 51.86A95.95 95.95 0 0 0 57.76 193.37l-15.68 17.25a8 8 0 1 0 11.84 10.76l15.68-17.24A95.95 95.95 0 0 0 198.24 62.63M48 128a80 80 0 0 1 127.6-64.25l-107 117.73A79.63 79.63 0 0 1 48 128m80 80a79.55 79.55 0 0 1-47.6-15.75l107-117.73A79.95 79.95 0 0 1 128 208"
      />
    </symbol>

    <symbol id="sparkles" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
      />
    </symbol>

    <symbol id="drag-handle-vertical" viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="12" r="1"></circle>
        <circle cx="9" cy="5" r="1"></circle>
        <circle cx="9" cy="19" r="1"></circle>
        <circle cx="15" cy="12" r="1"></circle>
        <circle cx="15" cy="5" r="1"></circle>
        <circle cx="15" cy="19" r="1"></circle>
      </g>
    </symbol>

    <symbol id="keyboard" viewBox="0 0 24 24">
      <g fill="none">
        <path
          fill="currentColor"
          d="M7 9a1 1 0 1 1-2 0a1 1 0 0 1 2 0m0 3a1 1 0 1 1-2 0a1 1 0 0 1 2 0m3 0a1 1 0 1 1-2 0a1 1 0 0 1 2 0m0-3a1 1 0 1 1-2 0a1 1 0 0 1 2 0m3 0a1 1 0 1 1-2 0a1 1 0 0 1 2 0m0 3a1 1 0 1 1-2 0a1 1 0 0 1 2 0m3-3a1 1 0 1 1-2 0a1 1 0 0 1 2 0m0 3a1 1 0 1 1-2 0a1 1 0 0 1 2 0m3-3a1 1 0 1 1-2 0a1 1 0 0 1 2 0m0 3a1 1 0 1 1-2 0a1 1 0 0 1 2 0"
        />
        <path
          stroke="currentColor"
          stroke-width="1.5"
          d="M2 11c0-2.828 0-4.243.879-5.121C3.757 5 5.172 5 8 5h8c2.828 0 4.243 0 5.121.879C22 6.757 22 8.172 22 11v2c0 2.828 0 4.243-.879 5.121C20.243 19 18.828 19 16 19H8c-2.828 0-4.243 0-5.121-.879C2 17.243 2 15.828 2 13z"
        />
        <path stroke="currentColor" stroke-linecap="round" stroke-width="1.5" d="M7 16h10" />
      </g>
    </symbol>

    <symbol id="fire" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z"
      />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z"
      />
    </symbol>

    <symbol id="star" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
      />
    </symbol>

    <symbol id="info" viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4m0-4h.01" />
      </g>
    </symbol>

    <symbol id="today" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M9 15.616q-.877 0-1.496-.62t-.62-1.496t.62-1.496T9 11.384t1.496.62t.62 1.496t-.62 1.496t-1.496.62M5.616 21q-.691 0-1.153-.462T4 19.385V6.615q0-.69.463-1.152T5.616 5h1.769V2.77h1.077V5h7.154V2.77h1V5h1.769q.69 0 1.153.463T20 6.616v12.769q0 .69-.462 1.153T18.384 21zm0-1h12.769q.23 0 .423-.192t.192-.424v-8.768H5v8.769q0 .23.192.423t.423.192M5 9.615h14v-3q0-.23-.192-.423T18.384 6H5.616q-.231 0-.424.192T5 6.616zm0 0V6z"
      />
    </symbol>

    <symbol id="cog" viewBox="0 0 20 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12.5 11C12.5 10.337 12.2366 9.70107 11.7678 9.23223C11.2989 8.76339 10.663 8.5 10 8.5C9.33696 8.5 8.70107 8.76339 8.23223 9.23223C7.76339 9.70107 7.5 10.337 7.5 11C7.5 11.663 7.76339 12.2989 8.23223 12.7678C8.70107 13.2366 9.33696 13.5 10 13.5C10.663 13.5 11.2989 13.2366 11.7678 12.7678C12.2366 12.2989 12.5 11.663 12.5 11Z"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M18.5 14.8V7.20004C18.4995 6.86738 18.4122 6.54062 18.2466 6.25209C18.081 5.96357 17.843 5.72329 17.556 5.55504L10.944 1.75504C10.6573 1.58855 10.3316 1.50085 10 1.50085C9.66843 1.50085 9.34275 1.58855 9.056 1.75504L2.444 5.55504C2.15635 5.72252 1.91774 5.96263 1.75207 6.25133C1.58639 6.54003 1.49947 6.86719 1.5 7.20004V14.802C1.50065 15.1345 1.58808 15.4611 1.75364 15.7494C1.91921 16.0378 2.15717 16.2779 2.444 16.446L9.056 20.246C9.34275 20.4125 9.66843 20.5002 10 20.5002C10.3316 20.5002 10.6573 20.4125 10.944 20.246L17.556 16.446C17.8438 16.2785 18.0825 16.0382 18.2482 15.7493C18.4139 15.4604 18.5007 15.1331 18.5 14.8Z"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </symbol>

    <symbol id="cog-off" viewBox="0 0 24 24">
      <path
        d="M6.01123 6.51709L4.8208 7.20166L4.82178 7.20264C4.64783 7.30391 4.5031 7.44999 4.40283 7.62451C4.30273 7.79907 4.25023 7.9975 4.25049 8.19873V15.8003L4.26026 15.9507C4.28006 16.0999 4.32939 16.2442 4.40479 16.3755C4.5053 16.5505 4.64963 16.6962 4.82373 16.7983H4.82276L11.4302 20.5952L11.4331 20.5972L11.5669 20.6636C11.7038 20.7204 11.8513 20.7495 12.0005 20.7495C12.1996 20.7494 12.3957 20.6971 12.5679 20.5972L12.5708 20.5952L17.4595 17.7847L18.5698 18.8774L13.3179 21.896L13.3169 21.895C12.9167 22.1265 12.4628 22.2494 12.0005 22.2495C11.5378 22.2495 11.0835 22.1268 10.6831 21.895V21.896L4.0708 18.0962L4.06494 18.0923C3.66568 17.8581 3.33451 17.5239 3.10401 17.1226C2.90223 16.7711 2.78338 16.3789 2.75635 15.9761L2.75049 15.8032V8.19971C2.75002 7.73599 2.87124 7.27966 3.10205 6.87744C3.33306 6.47516 3.66603 6.1402 4.0669 5.90674L4.0708 5.90479L4.90283 5.42529L6.01123 6.51709ZM12.0005 1.75049C12.4628 1.75057 12.9168 1.87351 13.3169 2.10498L13.3179 2.104L19.9302 5.90479L19.936 5.90771L20.0825 6.00049C20.4167 6.22696 20.6963 6.52698 20.898 6.87842C21.1284 7.2801 21.2498 7.73563 21.2505 8.19873V15.7983L21.2456 15.9722C21.2199 16.3759 21.1009 16.7702 20.8989 17.1226C20.7491 17.3836 20.5547 17.615 20.3286 17.8101L19.2505 16.7485L19.3042 16.7134C19.4227 16.6216 19.5231 16.5064 19.5981 16.3755C19.6981 16.2008 19.7509 16.0025 19.7505 15.8013V8.20068L19.7407 8.05029C19.721 7.90116 19.6715 7.75682 19.5962 7.62549C19.4957 7.45037 19.3514 7.30382 19.1772 7.20166V7.20068L12.5708 3.40479L12.5679 3.40283C12.3957 3.30292 12.1995 3.25057 12.0005 3.25049C11.8015 3.25049 11.6053 3.30303 11.4331 3.40283L11.4302 3.40479L7.80713 5.48584L6.69776 4.39404L10.6831 2.104V2.10498C11.0834 1.87335 11.5379 1.75049 12.0005 1.75049Z"
        fill="currentColor"
      />
      <path
        d="M10.3654 11.3781C10.2904 11.5749 10.2501 11.7854 10.2501 12.0001C10.2502 12.4642 10.4347 12.9093 10.7628 13.2374C11.091 13.5655 11.5361 13.7501 12.0001 13.7501C12.2299 13.7501 12.4547 13.7038 12.6632 13.6183L13.7863 14.713C13.2597 15.0598 12.6401 15.2501 12.0001 15.2501C11.1382 15.2501 10.3118 14.9074 9.70227 14.298C9.09281 13.6885 8.75016 12.862 8.75012 12.0001C8.75012 11.388 8.92286 10.7937 9.24133 10.2823L10.3654 11.3781ZM12.0001 8.75012C12.862 8.75015 13.6885 9.0928 14.298 9.70227C14.9074 10.3118 15.2501 11.1382 15.2501 12.0001C15.2501 12.3827 15.1812 12.7578 15.0529 13.1105L13.7413 11.8322V11.8273C13.7016 11.4267 13.5245 11.05 13.2374 10.7628C12.9389 10.4643 12.5435 10.286 12.1251 10.256L10.8116 8.97571C11.1867 8.82845 11.5894 8.75012 12.0001 8.75012Z"
        fill="currentColor"
      />
      <path d="M2 2L22.5 22.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </symbol>

    <symbol id="install" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M8 21v-2H4q-.825 0-1.412-.587T2 17V5q0-.825.588-1.412T4 3h8v2H4v12h16v-3h2v3q0 .825-.587 1.413T20 19h-4v2zm9-7l-5-5l1.4-1.4l2.6 2.575V3h2v7.175L20.6 7.6L22 9z"
      />
    </symbol>

    <symbol id="sidebar" viewBox="0 0 24 24">
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
        d="M2 12c0-3.69 0-5.534.814-6.841a4.8 4.8 0 0 1 1.105-1.243C5.08 3 6.72 3 10 3h4c3.28 0 4.919 0 6.081.916c.43.338.804.759 1.105 1.243C22 6.466 22 8.31 22 12s0 5.534-.814 6.841a4.8 4.8 0 0 1-1.105 1.243C18.92 21 17.28 21 14 21h-4c-3.28 0-4.919 0-6.081-.916a4.8 4.8 0 0 1-1.105-1.243C2 17.534 2 15.69 2 12m7.5-9v18M5 7h1m-1 3h1"
        color="currentColor"
      />
    </symbol>
    <symbol id="folder" viewBox="0 0 24 24">
      <path
        fill="none"
        stroke-width="1.5"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
      />
    </symbol>
    <symbol id="export" viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 15V3"></path>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <path d="m7 10 5 5 5-5"></path>
      </g>
    </symbol>
  </svg>
</template>