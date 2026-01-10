document.querySelectorAll(".neural-item").forEach(item => {
  item.addEventListener("click", () => {

    document.querySelectorAll(".neural-item").forEach(i => {
      if (i !== item) i.classList.remove("active");
    });

    item.classList.toggle("active");
  });
});
