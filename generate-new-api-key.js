const { execSync } = require('child_process');

// Esta función simula la generación de una nueva API key
// En un entorno real, esto se haría a través de la API de Twenty

console.log('Para generar una nueva API key con el código corregido:');
console.log('1. Ve a la interfaz de Twenty CRM');
console.log('2. Navega a Settings > APIs');
console.log('3. Crea una nueva API Key');
console.log('4. Copia el token generado');
console.log('');
console.log('O usa GraphQL mutation:');
console.log(`
mutation GenerateApiKeyToken {
  generateApiKeyToken(apiKeyId: "c420cdd3-7983-4f87-83fd-366c70dca287", expiresAt: "2025-12-31T23:59:59.000Z") {
    token
  }
}
`);
console.log('');
console.log('El problema fue corregido:');
console.log('- Cambiado JwtTokenTypeEnum.ACCESS a JwtTokenTypeEnum.API_KEY en la línea 147 de api-key.service.ts');
console.log('- Esto asegura que el secreto usado para firmar y verificar sea el mismo');