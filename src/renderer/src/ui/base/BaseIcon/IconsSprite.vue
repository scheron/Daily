<script setup lang="ts">
export type IconName =
  | "logo"
  | "calendar"
  | "x-mark"
  | "chevron-left"
  | "chevron-right"
  | "chevron-down"
  | "chevron-up"
  | "plus"
  | "minus"
  | "play"
  | "pencil"
  | "markdown"
  | "background"
  | "check"
  | "check-check"
  | "undo"
  | "hand-raised"
  | "empty"
  | "sparkles"
  | "keyboard"
  | "fire"
  | "star"
  | "info"
  | "today"
  | "sidebar"
  | "folder"
  | "folder-open"
  | "trash"
  | "archive"
  | "history"
  | "tags"
  | "monitor"
  | "refresh"
  | "stopwatch"
</script>

<template>
  <svg class="hidden" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <symbol id="logo" viewBox="0 0 300 300" fill="none">
      <path
        d="M240.001 0C273.138 0 300.001 26.8629 300.001 60V240.001C300.001 273.138 273.138 300.001 240.001 300.001H60C26.8629 300.001 0 273.138 0 240.001V60C2.96392e-05 26.8629 26.8629 0 60 0H240.001ZM76.0566 64.7891V95.9717H89.7764V205.616H76.0566V236.685H142.048C149.908 236.684 157.449 235.664 164.668 233.623C171.887 231.582 178.615 228.691 184.851 224.949C191.086 221.207 196.755 216.709 201.857 211.456C206.96 206.203 211.325 200.382 214.953 193.995C218.581 187.608 221.378 180.747 223.344 173.415C225.309 166.083 226.292 158.448 226.292 150.511C226.292 142.574 225.309 134.938 223.344 127.605C221.379 120.273 218.582 113.433 214.953 107.083C211.325 100.733 206.959 94.9692 201.857 89.791C196.756 84.6129 191.087 80.1717 184.851 76.4678C178.614 72.7639 171.887 69.8915 164.668 67.8506C157.449 65.8096 149.908 64.7891 142.047 64.7891H76.0566ZM141.82 95.9766C147.943 95.9763 153.725 97.3748 159.168 100.172C164.61 102.969 169.335 106.824 173.341 111.737C177.347 116.65 180.522 122.432 182.865 129.084C185.209 135.736 186.38 142.88 186.38 150.515C186.38 158.225 185.209 165.425 182.865 172.115C180.522 178.805 177.347 184.625 173.341 189.576C169.335 194.527 164.61 198.439 159.168 201.312C153.725 204.184 147.942 205.62 141.819 205.62H127.42V95.9756L141.82 95.9766Z"
        fill="currentColor"
      />
    </symbol>

    <symbol id="calendar" viewBox="0 0 24 24" stroke-width="1.5" fill="none" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z"
      />
    </symbol>

    <symbol id="x-mark" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
    </symbol>

    <symbol id="chevron-left" fill="none" viewBox="0 0 24 24">
      <path stroke-width="1.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </symbol>

    <symbol id="chevron-right" fill="none" viewBox="0 0 24 24">
      <path stroke-width="1.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </symbol>

    <symbol id="chevron-down" fill="none" viewBox="0 0 24 24">
      <path stroke-width="1.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M19.5 12l-7.5 7.5-7.5-7.5" />
    </symbol>

    <symbol id="chevron-up" fill="none" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" stroke="currentColor" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
    </symbol>

    <symbol id="plus" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </symbol>

<symbol id="minus" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
  <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" />
</symbol>


    <symbol id="pencil" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125"
      />
    </symbol>

    <symbol id="check" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M18.71 7.21a1 1 0 0 0-1.42 0l-7.45 7.46l-3.13-3.14A1 1 0 1 0 5.29 13l3.84 3.84a1 1 0 0 0 1.42 0l8.16-8.16a1 1 0 0 0 0-1.47"
      />
    </symbol>

    <symbol id="check-check" viewBox="0 0 24 24" fill="none">
      <g stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 6 7 17l-5-5"></path>
        <path d="m22 10-7.5 7.5L13 16"></path>
      </g>
    </symbol>

    <symbol id="undo" fill="none" viewBox="0 0 24 24">
      <path stroke-width="1.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
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

    <symbol id="keyboard" viewBox="0 0 24 24">
      <g fill="none">
        <path
          fill="currentColor"
          d="M7 9a1 1 0 1 1-2 0a1 1 0 0 1 2 0m0 3a1 1 0 1 1-2 0a1 1 0 0 1 2 0m3 0a1 1 0 1 1-2 0a1 1 0 0 1 2 0m0-3a1 1 0 1 1-2 0a1 1 0 0 1 2 0m3 0a1 1 0 1 1-2 0a1 1 0 0 1 2 0m0 3a1 1 0 1 1-2 0a1 1 0 0 1 2 0m3-3a1 1 0 1 1-2 0a1 1 0 0 1 2 0m0 3a1 1 0 1 1-2 0a1 1 0 0 1 2 0m3-3a1 1 0 1 1-2 0a1 1 0 0 1 2 0"
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
    <symbol id="folder-open" viewBox="0 0 24 24">
      <path
        fill="none"
        stroke-width="1.5"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M3.75 9.776c0-.414.336-.75.75-.75h13.5c.414 0 .75.336.75.75v6.75a.75.75 0 0 1-.75.75H4.5a.75.75 0 0 1-.75-.75v-6.75Zm0 0V6a2.25 2.25 0 0 1 2.25-2.25h5.379a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 6v3.776"
      />
    </symbol>
    <symbol id="trash" viewBox="0 0 20 22" fill="none">
      <path
        d="M1 5H19M6 5V3C6 2 7 1 8 1H12C13 1 14 2 14 3V5M17 9V19C17 20 16 21 15 21H5C4 21 3 20 3 19V9"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </symbol>

    <symbol id="archive" viewBox="0 0 21 21">
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M3.5 7.5h14v7.998a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2zm0-3.978h14a1 1 0 0 1 1 1V6.5a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1V4.522a1 1 0 0 1 1-1m5 6.978h4"
      />
    </symbol>

    <symbol id="history" viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
        <path d="M3 3v5h5"></path>
        <path d="M12 7v5l4 2"></path>
      </g>
    </symbol>
    <symbol id="tags" viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="m15 5 6.3 6.3a2.4 2.4 0 0 1 0 3.4L17 19"></path>
        <path
          d="M9.586 5.586A2 2 0 0 0 8.172 5H3a1 1 0 0 0-1 1v5.172a2 2 0 0 0 .586 1.414L8.29 18.29a2.426 2.426 0 0 0 3.42 0l3.58-3.58a2.426 2.426 0 0 0 0-3.42z"
        ></path>
        <circle cx="6.5" cy="9.5" r=".5" fill="currentColor"></circle>
      </g>
    </symbol>

    <symbol id="monitor" viewBox="0 0 24 24">
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
        d="M8 21h8m-4-4v4m8-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1Z"
      />
    </symbol>

    <symbol id="refresh" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
        <path d="M3 3v5h5"></path>
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
        <path d="M16 16h5v5"></path>
      </g>
    </symbol>

    <symbol id="stopwatch" fill="currentColor" viewBox="0 0 32 32">
      <path d="M15 11H17V20H15zM13 2H19V4H13z"></path>
      <path d="M28,9,26.58,7.59,24.33,9.84a10.94,10.94,0,1,0,1.18,1.65ZM16,26a9,9,0,1,1,9-9A9,9,0,0,1,16,26Z"></path>
    </symbol>

    <svg id="play" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
      />
    </svg>
  </svg>
</template>
