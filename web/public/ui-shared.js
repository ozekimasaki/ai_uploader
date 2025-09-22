(function(){
  try{
    var y = document.getElementById('y');
    if (y) y.textContent = String(new Date().getFullYear());
  }catch(e){}
})();

