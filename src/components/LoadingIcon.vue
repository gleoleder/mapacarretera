<template>
  <div class='spinner'></div>
</template>

<style scoped>
.spinner {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  border: 2px solid rgba(232, 255, 71, 0.12);
  border-top-color: #e8ff47;
  border-radius: 50%;
  animation: spin 0.65s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
