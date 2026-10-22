// Diz qual login falta (vem no endereco: ?servico=Cardapio.ai).
const servico = new URLSearchParams(location.search).get('servico');
if (servico) document.getElementById('texto').textContent = `Esta loja ainda não tem o login de ${servico} no cofre.`;
