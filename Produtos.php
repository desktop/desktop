<?php
class Produtos{

    public $id;
    public $nome;
    public $valor;
    public $quantidade;
    public $valorTotal;

    public function Calcular(){
        $this->valorTotal =  $this->valor * $this->quantidade;
        return $this->valorTotal;
    }
}
?>
