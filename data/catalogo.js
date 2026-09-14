const catalogo = {
    productos: [
        {
            id: "matera-aurora",
            nombre: "Matera Aurora",
            flor: "Tulipán",
            color: "Rojo",
            precio: 45000
        },
        {
            id: "matera-sol",
            nombre: "Matera Sol",
            flor: "Tulipán",
            color: "Amarillo",
            precio: 45000
        },
        {
            id: "matera-nube",
            nombre: "Matera Nube",
            flor: "Gerbera",
            color: "Blanco",
            precio: 45000
        },
        {
            id: "matera-rosa",
            nombre: "Matera Rosa",
            flor: "Gerbera",
            color: "Rosado",
            precio: 45000
        },
        {
            id: "matera-lavanda",
            nombre: "Matera Lavanda",
            flor: "Flor decorativa",
            color: "Morado",
            precio: 45000
        },
        {
            id: "matera-primavera",
            nombre: "Matera Primavera",
            flor: "Flor decorativa",
            color: "Azul",
            precio: 45000
        }
    ],

    personalizacion: {
        opciones: [
            {
                id: "enlace",
                nombre: "Enlace personalizado",
                descripcion:
                    "El cliente puede proporcionar un enlace para asociarlo al producto."
            },
            {
                id: "plantilla",
                nombre: "Plantilla Pipo Arte",
                descripcion:
                    "El cliente puede elegir una de las plantillas disponibles y personalizarla."
            }
        ],

        plantillas: [
            {
                id: "plantilla-1",
                nombre: "Recuerdos",
                contenido: [
                    "Mensaje personalizado",
                    "Canción",
                    "Fotografías"
                ]
            },
            {
                id: "plantilla-2",
                nombre: "Dedicatoria",
                contenido: [
                    "Mensaje personalizado",
                    "Canción",
                    "Fotografías"
                ]
            }
        ]
    },

    envios: {
        cobertura: "Nacional"
    },

    pagos: [
        "Nequi",
        "Davivienda"
    ]
};

module.exports = catalogo;