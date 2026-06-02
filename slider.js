let image=[
"static/img/1.png",
"static/img/2.png",
"static/img/3.png",
"static/img/4.png"
];

let i=0;

function show(){
    document
    .getElementById("slide")
    .src=image[i];
}

function nextSlide(){
    i=(i+1)%image.length;
    show();
}

function prevSlide(){
    i=(i-1+image.length);
    show();
}

setInterval(nextSlide, 3000)